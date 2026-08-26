-- =====================================================================
-- KapitPondo — Migration 0039
-- Fixes a real bug in record_walkin_contribution() (migration 0034): it
-- inserted the ledger entry first (without source_id, since the
-- contribution didn't exist yet), then tried to UPDATE that ledger_entries
-- row to backfill source_id once the contribution existed. ledger_entries
-- has a trigger blocking any UPDATE/DELETE ("ledger_entries is append-only;
-- create a reversing entry instead of editing or deleting"), so every
-- walk-in contribution has been failing on that backfill step since 0034 —
-- not just the self-recorded case fixed in the app layer separately.
--
-- Fix: reverse the insert order. Insert the contribution FIRST (its
-- ledger_entry_id starts null), then the ledger entry WITH source_id set
-- immediately (the contribution's id is already known), then backfill
-- ledger_entry_id on the CONTRIBUTION row instead — contributions has no
-- append-only trigger, and this is exactly the pattern approve_contribution()
-- already uses successfully (it updates contributions, never ledger_entries,
-- after the ledger insert).
-- =====================================================================

create or replace function record_walkin_contribution(
  p_membership_id     uuid,
  p_cycle_id          uuid,
  p_group_id          uuid,
  p_amount            numeric,
  p_payment_method    payment_method,
  p_external_reference text,
  p_officer_id        uuid
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
    payment_method, external_reference,
    recorded_by, approved_by, is_walk_in,
    status, paid_date
  ) values (
    p_membership_id, p_cycle_id, p_group_id, p_amount,
    p_payment_method, p_external_reference,
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
-- End of 0039_fix_walkin_contribution_append_only.sql
-- =====================================================================
