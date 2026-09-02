-- =====================================================================
-- KapitPondo — Migration 0043
-- record_walkin_contribution() had no way to attach a proof photo (signed
-- slip, screenshot) even though contributions.proof_url already exists and
-- the member self-submit flow uses it — cash walk-ins in particular have no
-- other record of the payment. Adds an optional p_proof_url param; NULL is
-- fine (e.g. a cash payment with no slip), matching the column's existing
-- nullability.
-- =====================================================================

-- CREATE OR REPLACE only replaces a function with the SAME parameter list;
-- adding p_proof_url changes the signature, so without this drop Postgres
-- would keep the old 7-arg version around as a separate overload — and a
-- call passing all 7 original named args would then be ambiguous between
-- the two.
drop function if exists record_walkin_contribution(uuid, uuid, uuid, numeric, payment_method, text, uuid);

create or replace function record_walkin_contribution(
  p_membership_id      uuid,
  p_cycle_id           uuid,
  p_group_id           uuid,
  p_amount             numeric,
  p_payment_method     payment_method,
  p_external_reference text,
  p_officer_id         uuid,
  p_proof_url          text default null
)
returns contributions
language plpgsql
security definer
as $$
declare
  v_contrib contributions;
  v_ledger  ledger_entries;
begin
  insert into contributions (
    membership_id, cycle_id, group_id, amount,
    payment_method, external_reference, proof_url,
    recorded_by, approved_by, is_walk_in,
    status, paid_date
  ) values (
    p_membership_id, p_cycle_id, p_group_id, p_amount,
    p_payment_method, p_external_reference, p_proof_url,
    p_officer_id, p_officer_id, true,
    'approved', current_date
  ) returning * into v_contrib;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    p_group_id, p_membership_id, p_cycle_id,
    'contribution', 'credit', p_amount,
    'contribution', v_contrib.id, p_officer_id
  ) returning * into v_ledger;

  update contributions set ledger_entry_id = v_ledger.id where id = v_contrib.id
  returning * into v_contrib;

  return v_contrib;
end;
$$;

-- =====================================================================
-- End of 0043_walkin_contribution_proof.sql
-- =====================================================================
