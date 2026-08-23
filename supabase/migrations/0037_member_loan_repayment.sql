-- =====================================================================
-- KapitPondo — Migration 0037
-- Member self-service loan repayment (submit proof → a DIFFERENT officer
-- confirms), mirroring the contributions submit→approve flow. Until now,
-- record_loan_repayment() only supported the Treasurer directly recording a
-- payment they physically received — there was no "member submits their own
-- proof" path at all (loans/repay.tsx existed in the UI but could never
-- succeed against any real endpoint). This adds the missing 'submitted'
-- half of loan_payment_status's own enum (it always had 'submitted' as a
-- value — nothing ever wrote it).
--
-- record_loan_repayment() itself is untouched — it stays the Treasurer's
-- direct-record path (cash received in person), same relationship as
-- record_walkin_contribution() vs. the member contribution flow.
-- =====================================================================

-- 'rejected' is new — needed so an officer can decline a member's submitted
-- claim (e.g. proof doesn't match) without forcing it through as paid.
alter type loan_payment_status add value if not exists 'rejected';

alter table loan_payments add column if not exists rejection_reason text;

-- ── submit_loan_repayment ────────────────────────────────────────────
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

-- ── confirm_loan_repayment ───────────────────────────────────────────
-- A DIFFERENT officer confirms a submitted claim — same interest-first
-- split + ledger post + balance update as record_loan_repayment(), just
-- applied to an existing pending row instead of inserting an already-paid
-- one. Segregation of duties enforced here too (recorder ≠ approver).
create or replace function confirm_loan_repayment(
  p_payment_id  uuid,
  p_approver_id uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_payment   loan_payments;
  v_loan      loans;
  v_ledger    ledger_entries;
  v_interest  numeric(14,2);
  v_principal numeric(14,2);
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

-- Note: `loan_payments` is already in supabase_realtime (migration 0035),
-- so repayment claims/confirmations already stream live — nothing more
-- needed here.

-- =====================================================================
-- End of 0037_member_loan_repayment.sql
-- =====================================================================
