-- =====================================================================
-- KapitPondo — Migration 0038
-- Future-plan scaffold for automated loan repayments via a payment gateway
-- (PayMongo → GCash/Maya/cards — `payment_method` already anticipated
-- 'paymongo' as a value, nothing ever wrote it). NOT LIVE — no gateway API
-- keys are configured anywhere in this project yet. This only adds the
-- columns and the SQL function the future webhook handler will call;
-- services/api/src/modules/payments/payments.routes.js's webhook endpoint
-- currently returns 501 until real credentials exist, so nothing here can
-- silently "succeed" without a real integration behind it.
--
-- Design note: a gateway-verified payment has no human "recorder"/
-- "approver" pair the way a manually-submitted or manually-recorded one
-- does — the trust model is the gateway's own signed webhook confirmation,
-- not two-person segregation of duties. auto_confirm_loan_repayment() posts
-- directly (recorded_by/approved_by left null), with gateway_provider +
-- gateway_reference standing in as the provenance the UI shows instead of a
-- person's name. A screenshot is no longer needed for these — the webhook
-- IS the proof, and is harder to fake than a photo.
-- =====================================================================

alter table loan_payments add column if not exists gateway_provider text;
alter table loan_payments add column if not exists gateway_reference text;
alter table loan_payments add column if not exists gateway_status text;
alter table loan_payments add column if not exists gateway_payload jsonb;
alter table loan_payments add column if not exists auto_confirmed boolean not null default false;

-- ── auto_confirm_loan_repayment ──────────────────────────────────────
-- The future webhook handler's counterpart to confirm_loan_repayment() —
-- same interest-first split + ledger post + balance update, but for a
-- gateway-verified payment posted in one shot rather than a human-submitted
-- claim waiting on a human confirm. p_gateway_reference is the provider's
-- own payment/checkout id — the "reference number" that used to have to be
-- typed in by hand.
create or replace function auto_confirm_loan_repayment(
  p_loan_id           uuid,
  p_amount            numeric,
  p_gateway_provider  text,
  p_gateway_reference text,
  p_gateway_status    text default 'paid',
  p_gateway_payload   jsonb default null
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
begin
  select * into v_loan from loans where id = p_loan_id;
  if not found then raise exception 'Loan not found'; end if;
  if v_loan.status not in ('active'::loan_status, 'approved'::loan_status) then
    raise exception 'Loan is not active (status: %)', v_loan.status;
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  v_interest  := least(round(v_loan.outstanding_balance * v_loan.interest_rate, 2), p_amount);
  v_principal := least(p_amount - v_interest, v_loan.outstanding_balance);

  -- posted_by has no natural person here (gateway-verified, not officer-
  -- confirmed) — the group's OWNER stands in as the ledger's required
  -- poster, same "on behalf of the group" role they already play elsewhere
  -- (e.g. finalize_distribution). Real provenance lives in gateway_provider/
  -- gateway_reference on the loan_payments row below, not here.
  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by, description
  ) values (
    v_loan.group_id, v_loan.membership_id,
    'loan_repayment'::ledger_entry_type, 'credit'::ledger_direction, p_amount,
    'loan', v_loan.id,
    (select owner_id from groups where id = v_loan.group_id),
    format('Auto-confirmed via %s (%s)', coalesce(p_gateway_provider, 'gateway'), p_gateway_reference)
  ) returning * into v_ledger;

  insert into loan_payments (
    loan_id, amount, principal_portion, interest_portion,
    status, payment_method, ledger_entry_id, paid_date,
    gateway_provider, gateway_reference, gateway_status, gateway_payload, auto_confirmed
  ) values (
    p_loan_id, p_amount, v_principal, v_interest,
    'paid'::loan_payment_status, 'paymongo'::payment_method, v_ledger.id, current_date,
    p_gateway_provider, p_gateway_reference, p_gateway_status, p_gateway_payload, true
  );

  update loans set
    outstanding_balance = greatest(outstanding_balance - v_principal, 0),
    status               = case
                              when outstanding_balance - v_principal <= 0 then 'paid'::loan_status
                              else 'active'::loan_status
                            end,
    updated_at           = now()
  where id = p_loan_id;

  return v_ledger;
end;
$$;

-- =====================================================================
-- End of 0038_repayment_gateway_scaffold.sql
-- =====================================================================
