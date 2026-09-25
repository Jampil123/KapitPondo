-- =====================================================================
-- KapitPondo — Migration 0075
-- Two-step money flow: nothing reaches the ledger on one person's say-so.
--
-- MONEY IN (contributions, loan repayments)
--   submitted ──confirm──▶ confirmed ("Pending verification") ──verify──▶ posted
--   * Confirm = the person holding the fund checks the money arrived:
--       the Treasurer, or the Organizer when the Treasurer is the payer.
--   * Verify  = the independent check, which is what posts to the ledger:
--       the Auditor, or the Organizer when the Auditor paid or recorded it
--       (or the group has no Auditor).
--   * Nobody confirms/verifies money they paid or recorded, and nobody does
--     both steps on the same record.
--   * A walk-in recorded by the person who would confirm it (usually the
--     Treasurer taking cash in person) counts as confirmed and goes straight
--     to "Pending verification". Replaces 0064's post-immediately rule.
--
-- LOANS (money out)
--     Borrower   | Approves  | Reviews before release | Releases  | Verifies release
--     -----------+-----------+------------------------+-----------+-----------------
--     Member     | Organizer | —                      | Treasurer | Auditor
--     Organizer  | Treasurer | Auditor                | Treasurer | Auditor
--     Treasurer  | Organizer | Auditor                | Organizer | Auditor
--     Auditor    | Organizer | Treasurer              | Treasurer | Organizer
--   * The borrower never takes part; nobody reviews or verifies their own
--     decision or release.
--   * Officer loans need the before-release review (review_required).
--   * Releasing hands out the cash but does NOT post; the release is posted
--     when it's verified. Until then the amount is held back from available
--     cash (group_available_cash / group_summary) so it can't be lent twice.
--
-- The old entry points (approve_contribution, confirm_loan_repayment,
-- disburse_loan) keep their names and signatures and route into the new
-- steps, so the current API keeps working until it's updated to call the
-- new functions directly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Statuses and columns
-- ---------------------------------------------------------------------
alter type contribution_status add value if not exists 'confirmed';
alter type loan_payment_status add value if not exists 'confirmed';

alter table contributions
  add column if not exists confirmed_by uuid references members(id),
  add column if not exists confirmed_at timestamptz;

alter table loan_payments
  add column if not exists confirmed_by uuid references members(id),
  add column if not exists confirmed_at timestamptz;

alter table loans
  add column if not exists review_required     boolean not null default false,
  add column if not exists reviewed_by         uuid references members(id),
  add column if not exists reviewed_at         timestamptz,
  add column if not exists review_note         text,
  add column if not exists release_verified_by uuid references members(id),
  add column if not exists release_verified_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Who does which step
-- ---------------------------------------------------------------------
create or replace function member_group_role(p_group_id uuid, p_member_id uuid)
returns text language sql stable security definer as $$
  select role::text from memberships
  where group_id = p_group_id and member_id = p_member_id and status = 'active'
  limit 1;
$$;

create or replace function group_has_role(p_group_id uuid, p_role text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from memberships
    where group_id = p_group_id and role::text = p_role and status = 'active'
  );
$$;

-- Money in: the confirming role for a payer with this role.
create or replace function money_in_confirm_role(p_payer_role text)
returns text language sql immutable as $$
  select case when p_payer_role = 'treasurer' then 'owner' else 'treasurer' end;
$$;

-- Money in: the verifying role (the one that posts). The Organizer steps in
-- when the Auditor paid or recorded the money, or the group has no Auditor.
create or replace function money_in_verify_role(p_group_id uuid, p_payer_role text, p_recorder_role text default null)
returns text language sql stable security definer as $$
  select case
    when p_payer_role = 'auditor' or p_recorder_role = 'auditor' or not group_has_role(p_group_id, 'auditor') then 'owner'
    else 'auditor'
  end;
$$;

-- Loans: the role for each duty, by the borrower's role (see the header table).
create or replace function loan_duty_role(p_borrower_role text, p_duty text)
returns text language sql immutable as $$
  select case p_duty
    when 'approve' then case when p_borrower_role = 'owner'     then 'treasurer' else 'owner'     end
    when 'review'  then case when p_borrower_role = 'auditor'   then 'treasurer' else 'auditor'   end
    when 'release' then case when p_borrower_role = 'treasurer' then 'owner'     else 'treasurer' end
    when 'verify'  then case when p_borrower_role = 'auditor'   then 'owner'     else 'auditor'   end
  end;
$$;

-- Friendly name for error messages.
create or replace function role_label(p_role text)
returns text language sql immutable as $$
  select case p_role when 'owner' then 'Organizer' when 'treasurer' then 'Treasurer' when 'auditor' then 'Auditor' else 'Member' end;
$$;

-- ---------------------------------------------------------------------
-- 3. Available cash holds back released-but-unverified loans
-- ---------------------------------------------------------------------
create or replace function group_available_cash(p_group_id uuid)
returns numeric(14,2)
language sql
security definer
stable
as $$
  select (
    coalesce((select sum(case when direction = 'credit' then amount else -amount end)
              from ledger_entries where group_id = p_group_id), 0)
    - coalesce((select sum(coalesce(approved_principal, principal))
                from loans
                where group_id = p_group_id and disbursed_at is not null and disbursed_ledger_entry_id is null), 0)
  )::numeric(14,2);
$$;

create or replace function group_summary(p_group_id uuid)
returns table (
  total_contributions      numeric(14,2),
  total_loan_disbursements numeric(14,2),
  total_loan_repayments    numeric(14,2),
  total_expenses           numeric(14,2),
  total_distributions      numeric(14,2),
  available_cash           numeric(14,2),
  active_members           bigint,
  total_heads              bigint,
  pending_loans            bigint
)
language plpgsql
security definer
stable
as $$
begin
  return query
  select
    coalesce(sum(case when l.entry_type = 'contribution'      and l.direction = 'credit' then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'loan_disbursement' and l.direction = 'debit'  then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'loan_repayment'    and l.direction = 'credit' then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'expense'           and l.direction = 'debit'  then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'distribution'      and l.direction = 'debit'  then l.amount else 0 end), 0)::numeric(14,2),
    group_available_cash(p_group_id),
    (select count(*) from memberships m where m.group_id = p_group_id and m.status = 'active'),
    (select coalesce(sum(m.heads), 0) from memberships m where m.group_id = p_group_id and m.status = 'active'),
    (select count(*) from loans ln where ln.group_id = p_group_id and ln.status = 'pending')
  from ledger_entries l
  where l.group_id = p_group_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Contributions
-- ---------------------------------------------------------------------
create or replace function confirm_contribution(p_contribution_id uuid, p_confirmer_id uuid)
returns contributions
language plpgsql
security definer
as $$
declare
  v_c          contributions;
  v_payer      uuid;
  v_payer_role text;
  v_role       text;
  v_needed     text;
begin
  select * into v_c from contributions where id = p_contribution_id for update;
  if not found then raise exception 'Contribution not found'; end if;
  if v_c.status <> 'submitted' then raise exception 'Contribution is not waiting for confirmation'; end if;

  select member_id into v_payer from memberships where id = v_c.membership_id;
  if p_confirmer_id = v_payer then raise exception 'You cannot confirm your own contribution'; end if;
  if p_confirmer_id = v_c.recorded_by then raise exception 'You cannot confirm a contribution you recorded'; end if;

  v_payer_role := member_group_role(v_c.group_id, v_payer);
  v_role       := member_group_role(v_c.group_id, p_confirmer_id);
  v_needed     := money_in_confirm_role(v_payer_role);
  if v_role is distinct from v_needed then
    raise exception 'This contribution must be confirmed by the %', role_label(v_needed);
  end if;

  update contributions set
    status       = 'confirmed',
    confirmed_by = p_confirmer_id,
    confirmed_at = now(),
    updated_at   = now()
  where id = p_contribution_id
  returning * into v_c;
  return v_c;
end;
$$;

create or replace function verify_contribution(p_contribution_id uuid, p_verifier_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_c          contributions;
  v_ledger     ledger_entries;
  v_payer      uuid;
  v_payer_role text;
  v_role       text;
  v_needed     text;
begin
  select * into v_c from contributions where id = p_contribution_id for update;
  if not found then raise exception 'Contribution not found'; end if;
  if v_c.status <> 'confirmed' then raise exception 'Contribution is not waiting for verification'; end if;

  select member_id into v_payer from memberships where id = v_c.membership_id;
  if p_verifier_id = v_payer then raise exception 'You cannot verify your own contribution'; end if;
  if p_verifier_id = v_c.recorded_by then raise exception 'You cannot verify a contribution you recorded'; end if;
  if p_verifier_id = v_c.confirmed_by then raise exception 'The person who confirmed a contribution cannot also verify it'; end if;

  v_payer_role := member_group_role(v_c.group_id, v_payer);
  v_role       := member_group_role(v_c.group_id, p_verifier_id);
  v_needed     := money_in_verify_role(v_c.group_id, v_payer_role, member_group_role(v_c.group_id, v_c.recorded_by));
  if v_role is distinct from v_needed then
    raise exception 'This contribution must be verified by the %', role_label(v_needed);
  end if;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_c.group_id, v_c.membership_id, v_c.cycle_id,
    'contribution', 'credit', v_c.amount,
    'contribution', v_c.id, p_verifier_id
  ) returning * into v_ledger;

  update contributions set
    status          = 'approved',
    approved_by     = p_verifier_id,
    paid_date       = current_date,
    ledger_entry_id = v_ledger.id,
    updated_at      = now()
  where id = p_contribution_id;

  return v_ledger;
end;
$$;

-- Walk-in: if the recorder is the person who'd confirm it, recording IS the
-- confirmation. Otherwise it waits in 'submitted' like any other claim.
create or replace function record_walk_in_contribution(p_contribution_id uuid, p_recorder_id uuid)
returns contributions
language plpgsql
security definer
as $$
declare
  v_c          contributions;
  v_payer      uuid;
begin
  select * into v_c from contributions where id = p_contribution_id for update;
  if not found then raise exception 'Contribution not found'; end if;
  if v_c.status <> 'submitted' then raise exception 'Contribution is not pending'; end if;
  if not v_c.is_walk_in or v_c.recorded_by is distinct from p_recorder_id then
    raise exception 'Only a walk-in recorded by this officer can be confirmed on recording';
  end if;

  select member_id into v_payer from memberships where id = v_c.membership_id;
  if v_payer <> p_recorder_id
     and member_group_role(v_c.group_id, p_recorder_id) = money_in_confirm_role(member_group_role(v_c.group_id, v_payer)) then
    update contributions set
      status       = 'confirmed',
      confirmed_by = p_recorder_id,
      confirmed_at = now(),
      updated_at   = now()
    where id = p_contribution_id
    returning * into v_c;
  end if;
  return v_c;
end;
$$;

-- Compatibility for the current API's walk-in path (0064's name and return
-- type): records the walk-in under the new rule and posts nothing.
create or replace function post_walk_in_contribution(p_contribution_id uuid, p_recorder_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
begin
  perform record_walk_in_contribution(p_contribution_id, p_recorder_id);
  return null;
end;
$$;

-- Compatibility: the old single step now does whichever step is next.
-- Returns the ledger entry only when this call posted (the verify step).
create or replace function approve_contribution(p_contribution_id uuid, p_approver_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_status contribution_status;
begin
  select status into v_status from contributions where id = p_contribution_id;
  if not found then raise exception 'Contribution not found'; end if;
  if v_status = 'submitted' then
    perform confirm_contribution(p_contribution_id, p_approver_id);
    return null;
  end if;
  return verify_contribution(p_contribution_id, p_approver_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Loan repayments
-- ---------------------------------------------------------------------
create or replace function confirm_repayment(p_payment_id uuid, p_confirmer_id uuid)
returns loan_payments
language plpgsql
security definer
as $$
declare
  v_p          loan_payments;
  v_loan       loans;
  v_borrower   uuid;
  v_needed     text;
begin
  select * into v_p from loan_payments where id = p_payment_id for update;
  if not found then raise exception 'Repayment not found'; end if;
  if v_p.status <> 'submitted'::loan_payment_status then raise exception 'Repayment is not waiting for confirmation'; end if;

  select * into v_loan from loans where id = v_p.loan_id;
  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if p_confirmer_id = v_borrower then raise exception 'You cannot confirm a repayment on your own loan'; end if;
  if p_confirmer_id = v_p.recorded_by then raise exception 'You cannot confirm a repayment you recorded'; end if;

  v_needed := money_in_confirm_role(member_group_role(v_loan.group_id, v_borrower));
  if member_group_role(v_loan.group_id, p_confirmer_id) is distinct from v_needed then
    raise exception 'This repayment must be confirmed by the %', role_label(v_needed);
  end if;

  update loan_payments set
    status       = 'confirmed'::loan_payment_status,
    confirmed_by = p_confirmer_id,
    confirmed_at = now(),
    updated_at   = now()
  where id = p_payment_id
  returning * into v_p;
  return v_p;
end;
$$;

-- Walk-in repayment: same rule as contributions — recorded by the person who'd
-- confirm it, it's confirmed on recording.
create or replace function record_walk_in_repayment(p_payment_id uuid, p_recorder_id uuid)
returns loan_payments
language plpgsql
security definer
as $$
declare
  v_p        loan_payments;
  v_loan     loans;
  v_borrower uuid;
begin
  select * into v_p from loan_payments where id = p_payment_id for update;
  if not found then raise exception 'Repayment not found'; end if;
  if v_p.status <> 'submitted'::loan_payment_status then raise exception 'Repayment is not pending'; end if;
  if not v_p.is_walk_in or v_p.recorded_by is distinct from p_recorder_id then
    raise exception 'Only a walk-in recorded by this officer can be confirmed on recording';
  end if;

  select * into v_loan from loans where id = v_p.loan_id;
  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if v_borrower <> p_recorder_id
     and member_group_role(v_loan.group_id, p_recorder_id) = money_in_confirm_role(member_group_role(v_loan.group_id, v_borrower)) then
    update loan_payments set
      status       = 'confirmed'::loan_payment_status,
      confirmed_by = p_recorder_id,
      confirmed_at = now(),
      updated_at   = now()
    where id = p_payment_id
    returning * into v_p;
  end if;
  return v_p;
end;
$$;

-- The posting half of 0063's confirm_loan_repayment (same flat-rate split),
-- now reached only after confirmation. New repayment entries point at the
-- payment (source_type 'loan_payment'), not the loan.
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

  -- Flat-rate split (0063).
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
    'loan_payment', v_payment.id, p_verifier_id
  ) returning * into v_ledger;

  update loan_payments set
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

-- Compatibility: the old single step now does whichever step is next.
create or replace function confirm_loan_repayment(p_payment_id uuid, p_approver_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_status loan_payment_status;
begin
  select status into v_status from loan_payments where id = p_payment_id;
  if not found then raise exception 'Repayment not found'; end if;
  if v_status = 'submitted'::loan_payment_status then
    perform confirm_repayment(p_payment_id, p_approver_id);
    return null;
  end if;
  return verify_repayment(p_payment_id, p_approver_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Loans
-- ---------------------------------------------------------------------
-- Approve (0026) + who may approve, and officer loans get flagged for review.
create or replace function approve_loan(
  p_loan_id            uuid,
  p_approver_id        uuid,
  p_interest_rate      numeric,
  p_approved_principal numeric default null
)
returns loans
language plpgsql
security definer
as $$
declare
  v_loan          loans;
  v_cash          numeric(14,2);
  v_amount        numeric(14,2);
  v_borrower      uuid;
  v_borrower_role text;
  v_needed        text;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'pending' then raise exception 'Loan is not pending'; end if;

  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if p_approver_id = v_borrower then raise exception 'You cannot approve your own loan'; end if;
  v_borrower_role := member_group_role(v_loan.group_id, v_borrower);
  v_needed := loan_duty_role(v_borrower_role, 'approve');
  if member_group_role(v_loan.group_id, p_approver_id) is distinct from v_needed then
    raise exception 'This loan must be decided by the %', role_label(v_needed);
  end if;

  v_amount := coalesce(p_approved_principal, v_loan.principal);
  if v_amount > v_loan.principal then
    raise exception 'Approved amount (%) cannot exceed the requested principal (%)', v_amount, v_loan.principal;
  end if;

  select group_available_cash(v_loan.group_id) into v_cash;
  if v_cash < v_amount then
    raise exception 'Insufficient liquidity: available cash (%) is less than the approved amount (%)', v_cash, v_amount;
  end if;

  update loans set
    status             = 'approved',
    interest_rate      = p_interest_rate,
    approved_principal = v_amount,
    approved_by        = p_approver_id,
    approved_at        = now(),
    review_required    = v_borrower_role in ('owner', 'treasurer', 'auditor'),
    reviewed_by        = null,
    reviewed_at        = null,
    review_note        = null,
    updated_at         = now()
  where id = p_loan_id
  returning * into v_loan;

  return v_loan;
end;
$$;

-- Before-release review (officer loans). Clearing unlocks the release; not
-- clearing sends the loan back to 'pending' with the reviewer's note so the
-- approver can reconsider.
create or replace function review_loan(p_loan_id uuid, p_reviewer_id uuid, p_cleared boolean, p_note text default null)
returns loans
language plpgsql
security definer
as $$
declare
  v_loan     loans;
  v_borrower uuid;
  v_needed   text;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'approved' or not v_loan.review_required or v_loan.reviewed_at is not null then
    raise exception 'Loan is not waiting for review';
  end if;

  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if p_reviewer_id = v_borrower then raise exception 'You cannot review your own loan'; end if;
  if p_reviewer_id = v_loan.approved_by then raise exception 'The person who approved a loan cannot also review it'; end if;
  v_needed := loan_duty_role(member_group_role(v_loan.group_id, v_borrower), 'review');
  if member_group_role(v_loan.group_id, p_reviewer_id) is distinct from v_needed then
    raise exception 'This loan must be reviewed by the %', role_label(v_needed);
  end if;
  if not p_cleared and coalesce(trim(p_note), '') = '' then
    raise exception 'Say why the loan is being sent back';
  end if;

  if p_cleared then
    update loans set reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = nullif(trim(p_note), ''), updated_at = now()
    where id = p_loan_id returning * into v_loan;
  else
    update loans set
      status = 'pending', approved_by = null, approved_at = null, approved_principal = null,
      review_required = false, review_note = trim(p_note), updated_at = now()
    where id = p_loan_id returning * into v_loan;
  end if;
  return v_loan;
end;
$$;

-- Release: the cash goes out now, the ledger posting waits for verification.
-- Signature kept from 0026; returns null because nothing is posted here.
create or replace function disburse_loan(p_loan_id uuid, p_disburser_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_loan     loans;
  v_cash     numeric(14,2);
  v_amount   numeric(14,2);
  v_borrower uuid;
  v_needed   text;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status <> 'approved' then raise exception 'Loan is not approved'; end if;
  if v_loan.review_required and v_loan.reviewed_at is null then
    raise exception 'This loan needs its before-release review first';
  end if;

  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if p_disburser_id = v_borrower then raise exception 'You cannot release your own loan'; end if;
  v_needed := loan_duty_role(member_group_role(v_loan.group_id, v_borrower), 'release');
  if member_group_role(v_loan.group_id, p_disburser_id) is distinct from v_needed then
    raise exception 'This loan must be released by the %', role_label(v_needed);
  end if;

  v_amount := coalesce(v_loan.approved_principal, v_loan.principal);
  select group_available_cash(v_loan.group_id) into v_cash;
  if v_cash < v_amount then
    raise exception 'Insufficient liquidity: available cash (%) is less than the approved amount (%)', v_cash, v_amount;
  end if;

  update loans set
    status              = 'active',
    outstanding_balance = v_amount,
    disbursed_by        = p_disburser_id,
    disbursed_at        = now(),
    updated_at          = now()
  where id = p_loan_id;

  return null;
end;
$$;

-- Verify the release record: this is what posts the disbursement.
create or replace function verify_loan_release(p_loan_id uuid, p_verifier_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_loan     loans;
  v_ledger   ledger_entries;
  v_borrower uuid;
  v_needed   text;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.disbursed_at is null or v_loan.disbursed_ledger_entry_id is not null then
    raise exception 'Loan release is not waiting for verification';
  end if;

  select member_id into v_borrower from memberships where id = v_loan.membership_id;
  if p_verifier_id = v_borrower then raise exception 'You cannot verify your own loan'; end if;
  if p_verifier_id = v_loan.disbursed_by then raise exception 'The person who released a loan cannot also verify the release'; end if;
  v_needed := loan_duty_role(member_group_role(v_loan.group_id, v_borrower), 'verify');
  if member_group_role(v_loan.group_id, p_verifier_id) is distinct from v_needed then
    raise exception 'This release must be verified by the %', role_label(v_needed);
  end if;

  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by, posted_at
  ) values (
    v_loan.group_id, v_loan.membership_id,
    'loan_disbursement', 'debit', coalesce(v_loan.approved_principal, v_loan.principal),
    'loan', v_loan.id, p_verifier_id, now()
  ) returning * into v_ledger;

  update loans set
    disbursed_ledger_entry_id = v_ledger.id,
    release_verified_by       = p_verifier_id,
    release_verified_at       = now(),
    updated_at                = now()
  where id = p_loan_id;

  return v_ledger;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Records already in flight
-- ---------------------------------------------------------------------
-- Officer loans approved but not yet released now need their review.
update loans l set review_required = true
from memberships m
where m.id = l.membership_id
  and l.status = 'approved' and l.disbursed_at is null
  and m.role::text in ('owner', 'treasurer', 'auditor');
-- Submitted contributions/repayments stay 'submitted' and go through both
-- steps. Nothing already in the ledger changes.

-- =====================================================================
-- End of 0075_two_step_money_flow.sql
-- =====================================================================
