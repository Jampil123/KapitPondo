-- =====================================================================
-- KapitPondo — Migration 0051
-- Extends the PayMongo gateway scaffold (0038, loan repayments only) to
-- contributions. Mirrors record_walkin_contribution() (0034) — an
-- already-approved contribution + its ledger credit inserted atomically in
-- one shot — rather than approve_contribution() (0044), since a
-- gateway-verified payment has no separate submit/confirm step and often no
-- pre-existing contribution row to update.
--
-- Same trust model as 0038's loan version: the gateway's own signed webhook
-- confirmation stands in for both recorder and approver, so recorded_by/
-- approved_by are left null (contrib_segregation already allows that — see
-- 0001's constraint: "approved_by is null or recorded_by is null ..."), with
-- gateway_provider/gateway_reference as the provenance the UI shows instead.
-- =====================================================================

alter table contributions add column if not exists gateway_provider text;
alter table contributions add column if not exists gateway_reference text;
alter table contributions add column if not exists gateway_status text;
alter table contributions add column if not exists gateway_payload jsonb;
alter table contributions add column if not exists auto_confirmed boolean not null default false;

-- ── auto_confirm_contribution ────────────────────────────────────────
create or replace function auto_confirm_contribution(
  p_membership_id     uuid,
  p_cycle_id          uuid,
  p_group_id          uuid,
  p_amount            numeric,
  p_gateway_provider  text,
  p_gateway_reference text,
  p_gateway_status    text default 'paid',
  p_gateway_payload   jsonb default null
)
returns contributions
language plpgsql
security definer
as $$
declare
  v_contrib  contributions;
  v_ledger   ledger_entries;
  v_owner_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  -- posted_by has no natural person here (gateway-verified, not
  -- officer-approved) — the group's OWNER stands in, same reasoning as
  -- auto_confirm_loan_repayment (0038).
  select owner_id into v_owner_id from groups where id = p_group_id;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, posted_by, description
  ) values (
    p_group_id, p_membership_id, p_cycle_id,
    'contribution', 'credit', p_amount,
    'contribution', v_owner_id,
    format('Auto-confirmed via %s (%s)', coalesce(p_gateway_provider, 'gateway'), p_gateway_reference)
  ) returning * into v_ledger;

  insert into contributions (
    membership_id, cycle_id, group_id, amount,
    payment_method, is_walk_in,
    status, paid_date, ledger_entry_id,
    gateway_provider, gateway_reference, gateway_status, gateway_payload, auto_confirmed
  ) values (
    p_membership_id, p_cycle_id, p_group_id, p_amount,
    'paymongo'::payment_method, false,
    'approved', current_date, v_ledger.id,
    p_gateway_provider, p_gateway_reference, p_gateway_status, p_gateway_payload, true
  ) returning * into v_contrib;

  -- Backfill source_id now that the contribution row exists — same
  -- two-step as record_walkin_contribution (the ledger entry references
  -- the contribution it caused, but that row doesn't exist until after).
  update ledger_entries set source_id = v_contrib.id where id = v_ledger.id;

  return v_contrib;
end;
$$;

-- =====================================================================
-- End of 0051_paymongo_contributions.sql
-- =====================================================================
