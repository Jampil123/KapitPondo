-- =====================================================================
-- KapitPondo — Migration 0028
-- QA fix for M9 (Year-End Distribution), TC-015/TC-027: a preview went
-- straight to the Owner for finalization with no Auditor sign-off at all.
-- Adds a 'verified' stage between previewed and finalized.
--
-- TC-038 (Unverified member payout policy) needed no schema/logic change —
-- see preview_distribution below: contributed capital is paid out to every
-- active membership by heads regardless of verification_status, since
-- verification gates privileges (creating groups, borrowing, officer roles),
-- not ownership of money already in the fund. This is now a documented
-- decision, not an accidental default.
-- =====================================================================

alter type distribution_status add value if not exists 'verified';

alter table distributions
  add column if not exists verified_by uuid references members(id),
  add column if not exists verified_at timestamptz,
  add column if not exists verify_notes text;

-- finalize_distribution now requires 'verified' (was 'previewed') —
-- the Auditor's sign-off is a real gate, not just a status label.
create or replace function finalize_distribution(
  p_distribution_id uuid,
  p_finalized_by    uuid
)
returns distributions
language plpgsql
security definer
as $$
declare
  v_dist      distributions;
  v_alloc     distribution_allocations;
  v_ledger    ledger_entries;
  v_curr_cash numeric(14,2);
begin
  select * into v_dist from distributions where id = p_distribution_id;
  if not found then raise exception 'Distribution not found'; end if;
  if v_dist.status <> 'verified' then
    raise exception 'Distribution is not verified (current status: %)', v_dist.status;
  end if;

  select group_available_cash(v_dist.group_id) into v_curr_cash;
  if abs(v_curr_cash - v_dist.total_amount) > 0.01 then
    raise exception 'Fund changed since preview: current=%, preview=%',
      v_curr_cash, v_dist.total_amount;
  end if;

  for v_alloc in
    select * from distribution_allocations where distribution_id = p_distribution_id
  loop
    insert into ledger_entries (
      group_id, membership_id,
      entry_type, direction, amount,
      source_type, source_id, posted_by
    ) values (
      v_dist.group_id, v_alloc.membership_id,
      'distribution', 'debit', v_alloc.amount,
      'distribution', v_dist.id, p_finalized_by
    ) returning * into v_ledger;

    update distribution_allocations
    set ledger_entry_id = v_ledger.id
    where id = v_alloc.id;
  end loop;

  update distributions set
    status       = 'finalized',
    finalized_by = p_finalized_by,
    finalized_at = now(),
    updated_at   = now()
  where id = p_distribution_id
  returning * into v_dist;

  return v_dist;
end;
$$;

comment on function preview_distribution(uuid, text, uuid) is
  'Allocates available cash proportional to heads across every ACTIVE membership, regardless of verification_status. '
  'Documented policy decision (QA TC-038): verification gates privileges (creating groups, borrowing, officer roles), '
  'not ownership of capital already contributed to the fund — an Unverified member is paid out the same as everyone else.';

-- =====================================================================
-- End of 0028_distribution_verification.sql
-- =====================================================================
