-- =====================================================================
-- KapitPondo — 0012 Functions: loans & repayments
-- LOANS (money out)
--     Borrower   | Approves  | Reviews before release | Releases  | Verifies release
--     -----------+-----------+------------------------+-----------+-----------------
--     Member     | Organizer | —                      | Treasurer | Auditor
--     Organizer  | Treasurer | Auditor                | Treasurer | Auditor
--     Treasurer  | Organizer | Auditor                | Organizer | Auditor
--     Auditor    | Organizer | Treasurer              | Treasurer | Organizer
--   * Releasing hands out the cash but does NOT post; the release posts
--     when verified. Until then it is held back from available cash.
--
-- REPAYMENTS follow the same confirm → verify flow as contributions.
-- Interest is flat; each payment splits in the ratio of one installment.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Duty matrix
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- Loan lifecycle
-- ---------------------------------------------------------------------

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
-- Repayments
-- ---------------------------------------------------------------------

-- Member records a claim + proof — no money moves yet. Confirmed later by
-- confirm_loan_repayment(), same "claim now, post on confirm" shape as a
-- member's own contribution submission.
create or replace function submit_loan_repayment(
  p_loan_id            uuid,
  p_amount             numeric,
  p_recorded_by        uuid,
  p_payment_method     text default null,
  p_proof_url          text default null,
  p_external_reference text default null
)
returns loan_payments
language plpgsql
security definer
as $$
declare
  v_loan    loans;
  v_payment loan_payments;
  v_pm      payment_method;
begin
  select * into v_loan from loans where id = p_loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active'::loan_status, 'approved'::loan_status) then
    raise exception 'Loan is not active (status: %)', v_loan.status;
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_payment_method is not null then
    v_pm := p_payment_method::payment_method;
  end if;

  insert into loan_payments (
    loan_id, amount, status, payment_method, proof_url, external_reference, recorded_by
  ) values (
    p_loan_id, p_amount, 'submitted'::loan_payment_status, v_pm, p_proof_url, p_external_reference, p_recorded_by
  ) returning * into v_payment;

  return v_payment;
end;
$$;

create or replace function submit_loan_repayment(
  p_loan_id            uuid,
  p_amount             numeric,
  p_recorded_by        uuid,
  p_payment_method     text default null,
  p_proof_url          text default null,
  p_external_reference text default null,
  p_is_walk_in         boolean default false
)
returns loan_payments
language plpgsql
security definer
as $$
declare
  v_loan    loans;
  v_payment loan_payments;
  v_pm      payment_method;
begin
  select * into v_loan from loans where id = p_loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active'::loan_status, 'approved'::loan_status) then
    raise exception 'Loan is not active (status: %)', v_loan.status;
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_payment_method is not null then
    v_pm := p_payment_method::payment_method;
  end if;

  insert into loan_payments (
    loan_id, amount, status, payment_method, proof_url, external_reference, recorded_by, is_walk_in
  ) values (
    p_loan_id, p_amount, 'submitted'::loan_payment_status, v_pm, p_proof_url, p_external_reference, p_recorded_by, p_is_walk_in
  ) returning * into v_payment;

  return v_payment;
end;
$$;

create or replace function record_loan_repayment(
  p_loan_id            uuid,
  p_amount             numeric,
  p_recorded_by        uuid,
  p_approver_id        uuid,
  p_payment_method     text    default null,
  p_proof_url          text    default null,
  p_external_reference text    default null
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_loan      loans;
  v_ledger    ledger_entries;
  v_interest  numeric(14,2);
  v_principal numeric(14,2);
  v_pm        payment_method;
begin
  if p_recorded_by = p_approver_id then
    raise exception 'Approver cannot be the same person as the recorder';
  end if;

  select * into v_loan from loans where id = p_loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active'::loan_status, 'approved'::loan_status) then
    raise exception 'Loan is not active (status: %)', v_loan.status;
  end if;

  v_interest  := least(round(v_loan.outstanding_balance * v_loan.interest_rate, 2), p_amount);
  v_principal := least(p_amount - v_interest, v_loan.outstanding_balance);

  if p_payment_method is not null then
    v_pm := p_payment_method::payment_method;
  end if;

  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_loan.group_id, v_loan.membership_id,
    'loan_repayment'::ledger_entry_type, 'credit'::ledger_direction, p_amount,
    'loan', v_loan.id, p_approver_id
  ) returning * into v_ledger;

  insert into loan_payments (
    loan_id, amount, principal_portion, interest_portion,
    status, payment_method, proof_url, external_reference,
    recorded_by, approved_by, ledger_entry_id, paid_date
  ) values (
    p_loan_id, p_amount, v_principal, v_interest,
    'paid'::loan_payment_status, v_pm, p_proof_url, p_external_reference,
    p_recorded_by, p_approver_id, v_ledger.id, current_date
  );

  update loans set
    outstanding_balance = greatest(outstanding_balance - v_principal, 0),
    status              = case
                            when outstanding_balance - v_principal <= 0 then 'paid'::loan_status
                            else 'active'::loan_status
                          end,
    updated_at          = now()
  where id = p_loan_id;

  return v_ledger;
end;
$$;

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
