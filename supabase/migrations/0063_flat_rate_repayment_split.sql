-- 0063_flat_rate_repayment_split.sql
-- ----------------------------------------------------------------------------
-- Loan interest is flat: loan amount × monthly rate, every month of the term
-- (₱1,000 at 3% for 2 months = ₱30 + ₱30, so ₱530 each month). The app's
-- request, loan and repay screens already quote it that way, but
-- confirm_loan_repayment (0045/0062) charged interest on the balance still
-- owed, so the second ₱530 was split ₱15 interest + ₱500 principal instead of
-- ₱30 + ₱500.
--
-- New split: each payment is divided in the same ratio as one monthly
-- installment (interest : principal = P×rate : P/term), capped at the flat
-- interest still unpaid and the principal still owed. A partial payment splits
-- proportionally; paying two months at once takes two months of interest.
-- Everything else (approval rules, ledger posting, loan closing) is unchanged
-- from 0062.

create or replace function confirm_loan_repayment(
  p_payment_id  uuid,
  p_approver_id uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_payment        loan_payments;
  v_loan           loans;
  v_ledger         ledger_entries;
  v_interest       numeric(14,2);
  v_principal      numeric(14,2);
  v_recorder_role  text;
  v_approver_role  text;
  v_loan_amount    numeric(14,2);
  v_month_interest numeric(14,2);
  v_monthly        numeric(14,2);
  v_interest_left  numeric(14,2);
begin
  select * into v_payment from loan_payments where id = p_payment_id;
  if not found then raise exception 'Repayment not found'; end if;
  if v_payment.status <> 'submitted'::loan_payment_status then
    raise exception 'Repayment is not pending confirmation';
  end if;
  if v_payment.recorded_by = p_approver_id then
    raise exception 'Approver cannot be the same person as the recorder';
  end if;

  select * into v_loan from loans where id = v_payment.loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active'::loan_status, 'approved'::loan_status) then
    raise exception 'Loan is not active (status: %)', v_loan.status;
  end if;

  if v_payment.recorded_by is not null then
    select role into v_recorder_role
    from memberships
    where member_id = v_payment.recorded_by and group_id = v_loan.group_id;
  end if;

  if v_recorder_role = 'treasurer' then
    select role into v_approver_role
    from memberships
    where member_id = p_approver_id and group_id = v_loan.group_id;

    if v_approver_role <> 'owner' then
      raise exception 'A repayment the Treasurer recorded must be confirmed by the Organizer';
    end if;
  end if;

  -- Flat-rate split (see header).
  v_loan_amount := coalesce(v_loan.approved_principal, v_loan.principal);
  if coalesce(v_loan.interest_rate, 0) > 0 and coalesce(v_loan.term_months, 0) > 0 then
    v_month_interest := round(v_loan_amount * v_loan.interest_rate, 2);
    v_monthly        := v_loan_amount / v_loan.term_months + v_month_interest;

    select greatest(round(v_loan_amount * v_loan.interest_rate * v_loan.term_months, 2) - coalesce(sum(interest_portion), 0), 0)
      into v_interest_left
    from loan_payments
    where loan_id = v_loan.id and status in ('paid'::loan_payment_status, 'approved'::loan_payment_status);

    v_interest := least(round(v_payment.amount * v_month_interest / v_monthly, 2), v_interest_left, v_payment.amount);
  else
    v_interest := 0;
  end if;
  v_principal := least(v_payment.amount - v_interest, v_loan.outstanding_balance);

  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_loan.group_id, v_loan.membership_id,
    'loan_repayment'::ledger_entry_type, 'credit'::ledger_direction, v_payment.amount,
    'loan', v_loan.id, p_approver_id
  ) returning * into v_ledger;

  update loan_payments set
    principal_portion = v_principal,
    interest_portion  = v_interest,
    status             = 'paid'::loan_payment_status,
    approved_by        = p_approver_id,
    ledger_entry_id    = v_ledger.id,
    paid_date          = current_date,
    updated_at         = now()
  where id = p_payment_id;

  update loans set
    outstanding_balance = greatest(outstanding_balance - v_principal, 0),
    status               = case
                              when outstanding_balance - v_principal <= 0 then 'paid'::loan_status
                              else 'active'::loan_status
                            end,
    updated_at           = now()
  where id = v_loan.id;

  return v_ledger;
end;
$$;
