-- =====================================================================
-- KapitPondo — 0077 Loan late-payment penalty
--
-- An optional percentage the cycle charges on a loan installment for every
-- month it stays unpaid past its due date. It accrues: an installment two
-- months late carries the penalty twice.
--
--   ₱3,000 over 3 months → ₱1,000/month, 10% late penalty.
--   Month 1 unpaid past its due date      → ₱1,000 + ₱100
--   Month 2's due date passes, still none → month 1: ₱1,000 + ₱200
--                                           month 2: ₱1,000 + ₱100
--
-- * cycles.loan_late_penalty_pct — set on Configure Cycle; null = none.
-- * loans.late_penalty_pct       — copied from the group's active cycle when
--   the loan is released, so a later cycle change never re-prices a loan.
-- * loan_payments.penalty_portion — how much of a posted repayment went to
--   penalty. A repayment pays penalty first, then interest, then principal,
--   so a loan can't close while a penalty is still owed.
--
-- Nothing is stored per penalty: what's owed is derived from the schedule
-- (installment k due k months after release) and the posted repayments, by
-- loan_penalty_accrued() / loan_penalty_owed() below. The app mirrors the
-- same rule in src/features/lending/loanSchedule.ts.
-- =====================================================================

alter table public.cycles
  add column if not exists loan_late_penalty_pct numeric(5,2)
    check (loan_late_penalty_pct >= 0 and loan_late_penalty_pct <= 100);
comment on column public.cycles.loan_late_penalty_pct is
  'Percent of a loan installment charged per month it is late; null = none.';

alter table public.loans
  add column if not exists late_penalty_pct numeric(5,2)
    check (late_penalty_pct >= 0 and late_penalty_pct <= 100);
comment on column public.loans.late_penalty_pct is
  'Late penalty rate copied from the active cycle at release; null = none.';

alter table public.loan_payments
  add column if not exists penalty_portion numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------
-- Copy the cycle's rate onto the loan the moment it is released.
-- ---------------------------------------------------------------------
create or replace function snapshot_loan_late_penalty()
returns trigger
language plpgsql
as $$
begin
  if new.disbursed_at is not null and old.disbursed_at is null and new.late_penalty_pct is null then
    select c.loan_late_penalty_pct into new.late_penalty_pct
    from cycles c
    where c.group_id = new.group_id and c.status = 'active'
    order by c.start_date desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists loans_snapshot_late_penalty on loans;
create trigger loans_snapshot_late_penalty before update on loans
  for each row execute function snapshot_loan_late_penalty();

-- ---------------------------------------------------------------------
-- Penalty accrued so far on a loan (paid or not).
-- Installment k (1..term) is due k months after release and is worth the
-- flat-rate monthly amount. It counts one penalty for each monthly
-- anniversary of its due date that passed before it was covered — covered
-- meaning the posted repayments' principal + interest reached k × monthly.
-- ---------------------------------------------------------------------
create or replace function loan_penalty_accrued(p_loan_id uuid, p_as_of date default current_date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_loan       loans;
  v_amount     numeric(14,2);
  v_monthly    numeric(14,2);
  v_per        numeric(14,2);
  v_due        date;
  v_covered_on date;
  v_end        date;
  v_age        interval;
  v_months     int;
  v_total      numeric(14,2) := 0;
begin
  select * into v_loan from loans where id = p_loan_id;
  if not found or v_loan.disbursed_at is null or coalesce(v_loan.late_penalty_pct, 0) = 0 or v_loan.term_months <= 0 then
    return 0;
  end if;

  v_amount  := coalesce(v_loan.approved_principal, v_loan.principal);
  v_monthly := round(v_amount / v_loan.term_months + v_amount * coalesce(v_loan.interest_rate, 0), 2);
  v_per     := round(v_monthly * v_loan.late_penalty_pct / 100, 2);
  if v_per <= 0 then return 0; end if;

  for k in 1..v_loan.term_months loop
    v_due := (v_loan.disbursed_at::date + make_interval(months => k))::date;
    exit when v_due >= p_as_of;   -- not late yet (and neither is anything after it)

    select min(paid_on) into v_covered_on
    from (
      select coalesce(paid_date, updated_at::date) as paid_on,
             sum(principal_portion + interest_portion)
               over (order by coalesce(paid_date, updated_at::date), created_at, id) as covered
      from loan_payments
      where loan_id = p_loan_id
        and status in ('paid'::loan_payment_status, 'approved'::loan_payment_status)
    ) x
    where covered >= k * v_monthly - 0.01;

    v_end := least(coalesce(v_covered_on, p_as_of), p_as_of);
    if v_end > v_due then
      v_age    := age(v_end, v_due);
      v_months := (extract(year from v_age) * 12 + extract(month from v_age))::int;
      -- One penalty per anniversary of the due date that is strictly before v_end.
      if (v_due + make_interval(months => v_months))::date < v_end then
        v_months := v_months + 1;
      end if;
      v_total := v_total + v_per * v_months;
    end if;
  end loop;

  return v_total;
end;
$$;

-- What's still owed in penalty: accrued less what posted repayments paid.
create or replace function loan_penalty_owed(p_loan_id uuid, p_as_of date default current_date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    loan_penalty_accrued(p_loan_id, p_as_of)
      - coalesce((select sum(penalty_portion) from loan_payments
                  where loan_id = p_loan_id
                    and status in ('paid'::loan_payment_status, 'approved'::loan_payment_status)), 0),
    0);
$$;

-- ---------------------------------------------------------------------
-- verify_repayment (from 0012/0063), now penalty first: the penalty owed
-- comes off the payment before the flat-rate interest/principal split.
-- ---------------------------------------------------------------------
create or replace function verify_repayment(p_payment_id uuid, p_verifier_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_payment        loan_payments;
  v_loan           loans;
  v_ledger         ledger_entries;
  v_borrower       uuid;
  v_needed         text;
  v_penalty        numeric(14,2);
  v_rest           numeric(14,2);
  v_interest       numeric(14,2);
  v_principal      numeric(14,2);
  v_loan_amount    numeric(14,2);
  v_month_interest numeric(14,2);
  v_monthly        numeric(14,2);
  v_interest_left  numeric(14,2);
begin
  select * into v_payment from loan_payments where id = p_payment_id for update;
  if not found then raise exception 'Repayment not found'; end if;
  if v_payment.status <> 'confirmed'::loan_payment_status then
    raise exception 'Repayment is not waiting for verification';
  end if;

  select * into v_loan from loans where id = v_payment.loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active'::loan_status, 'approved'::loan_status) then
    raise exception 'Loan is not active (status: %)', v_loan.status;
  end if;

  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if p_verifier_id = v_borrower then raise exception 'You cannot verify a repayment on your own loan'; end if;
  if p_verifier_id = v_payment.recorded_by then raise exception 'You cannot verify a repayment you recorded'; end if;
  if p_verifier_id = v_payment.confirmed_by then raise exception 'The person who confirmed a repayment cannot also verify it'; end if;

  v_needed := money_in_verify_role(v_loan.group_id, member_group_role(v_loan.group_id, v_borrower), member_group_role(v_loan.group_id, v_payment.recorded_by));
  if member_group_role(v_loan.group_id, p_verifier_id) is distinct from v_needed then
    raise exception 'This repayment must be verified by the %', role_label(v_needed);
  end if;

  -- Late penalty first (0077).
  v_penalty := least(loan_penalty_owed(v_loan.id), v_payment.amount);
  v_rest    := v_payment.amount - v_penalty;

  -- Flat-rate split of the rest (0063).
  v_loan_amount := coalesce(v_loan.approved_principal, v_loan.principal);
  if v_rest > 0 and coalesce(v_loan.interest_rate, 0) > 0 and coalesce(v_loan.term_months, 0) > 0 then
    v_month_interest := round(v_loan_amount * v_loan.interest_rate, 2);
    v_monthly        := v_loan_amount / v_loan.term_months + v_month_interest;

    select greatest(round(v_loan_amount * v_loan.interest_rate * v_loan.term_months, 2) - coalesce(sum(interest_portion), 0), 0)
      into v_interest_left
    from loan_payments
    where loan_id = v_loan.id and status in ('paid'::loan_payment_status, 'approved'::loan_payment_status);

    v_interest := least(round(v_rest * v_month_interest / v_monthly, 2), v_interest_left, v_rest);
  else
    v_interest := 0;
  end if;
  v_principal := greatest(least(v_rest - v_interest, v_loan.outstanding_balance), 0);

  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_loan.group_id, v_loan.membership_id,
    'loan_repayment'::ledger_entry_type, 'credit'::ledger_direction, v_payment.amount,
    'loan_payment', v_payment.id, p_verifier_id
  ) returning * into v_ledger;

  update loan_payments set
    penalty_portion   = v_penalty,
    principal_portion = v_principal,
    interest_portion  = v_interest,
    status            = 'paid'::loan_payment_status,
    approved_by       = p_verifier_id,
    ledger_entry_id   = v_ledger.id,
    paid_date         = current_date,
    updated_at        = now()
  where id = p_payment_id;

  update loans set
    outstanding_balance = greatest(outstanding_balance - v_principal, 0),
    status              = case when outstanding_balance - v_principal <= 0 then 'paid'::loan_status else 'active'::loan_status end,
    updated_at          = now()
  where id = v_loan.id;

  return v_ledger;
end;
$$;
