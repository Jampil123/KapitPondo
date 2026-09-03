-- =====================================================================
-- KapitPondo — Migration 0045
-- Same real gap as contributions had before migration 0044: the officer's
-- direct "Record new" repayment flow (record_loan_repayment) posted to the
-- ledger in ONE call. Its p_approver_id was passed in by the SAME caller,
-- with no independent action from that officer required — the only check
-- was "not literally the same person," so it was attribution, not a real
-- second-person control.
--
-- Fix: officer-recorded repayments now go through the SAME submit → a-
-- different-officer-confirms pipeline as a member's own claim
-- (submit_loan_repayment / confirm_loan_repayment, migration 0037) — tagged
-- is_walk_in so the app can tell them apart, mirroring is_walk_in on
-- contributions (migration 0034). record_loan_repayment() is left in place
-- but no longer called from the API — nothing currently depends on it.
--
-- Also mirrors migration 0044: when the person who RECORDED the repayment
-- holds the Treasurer role, only the Auditor may confirm it — not just
-- "any other officer." Scoped to the recorder's role so a lone Auditor who
-- personally records a repayment isn't left with no valid confirmer.
-- =====================================================================

alter table loan_payments add column if not exists is_walk_in boolean not null default false;

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

create or replace function confirm_loan_repayment(
  p_payment_id  uuid,
  p_approver_id uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_payment       loan_payments;
  v_loan          loans;
  v_ledger        ledger_entries;
  v_interest      numeric(14,2);
  v_principal     numeric(14,2);
  v_recorder_role text;
  v_approver_role text;
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

    if v_approver_role <> 'auditor' then
      raise exception 'A repayment the Treasurer recorded must be confirmed by the Auditor';
    end if;
  end if;

  v_interest  := least(round(v_loan.outstanding_balance * v_loan.interest_rate, 2), v_payment.amount);
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

-- =====================================================================
-- End of 0045_loan_repayment_two_stage.sql
-- =====================================================================
