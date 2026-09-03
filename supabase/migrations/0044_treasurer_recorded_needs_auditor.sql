-- =====================================================================
-- KapitPondo — Migration 0044
-- Real segregation gap: approve_contribution() only ever checked
-- "approver isn't the recorder" — ANY other officer (Treasurer, Auditor, or
-- Owner) could confirm a payment the Treasurer recorded and it posted to the
-- ledger immediately. Money the Treasurer personally received (a walk-in
-- cash/GCash entry — see is_walk_in, migration 0034) should specifically be
-- checked by the Auditor before it posts, not just by "whichever officer
-- got to it first."
--
-- Scoped to the RECORDER's role, not just is_walk_in, so this doesn't create
-- a dead end: if the Auditor (or Owner) is the one who personally recorded a
-- walk-in, the existing "not the recorder" rule still applies (any other
-- officer can confirm it) — only a Treasurer-recorded entry specifically
-- requires the Auditor. A group only ever has one Auditor, so requiring the
-- Auditor to approve their OWN recording would strand it with no valid
-- approver at all.
-- =====================================================================

create or replace function approve_contribution(
  p_contribution_id uuid,
  p_approver_id     uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_contrib       contributions;
  v_ledger        ledger_entries;
  v_recorder_role text;
  v_approver_role text;
begin
  select * into v_contrib from contributions where id = p_contribution_id;
  if not found then
    raise exception 'Contribution not found';
  end if;

  if v_contrib.recorded_by = p_approver_id then
    raise exception 'You cannot approve a contribution you recorded';
  end if;

  if v_contrib.recorded_by is not null then
    select role into v_recorder_role
    from memberships
    where member_id = v_contrib.recorded_by and group_id = v_contrib.group_id;
  end if;

  if v_recorder_role = 'treasurer' then
    select role into v_approver_role
    from memberships
    where member_id = p_approver_id and group_id = v_contrib.group_id;

    if v_approver_role <> 'auditor' then
      raise exception 'A payment the Treasurer recorded must be confirmed by the Auditor';
    end if;
  end if;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_contrib.group_id, v_contrib.membership_id, v_contrib.cycle_id,
    'contribution', 'credit', v_contrib.amount,
    'contribution', v_contrib.id, p_approver_id
  ) returning * into v_ledger;

  update contributions set
    status          = 'approved',
    approved_by     = p_approver_id,
    paid_date       = current_date,
    ledger_entry_id = v_ledger.id,
    updated_at      = now()
  where id = p_contribution_id;

  return v_ledger;
end;
$$;

-- =====================================================================
-- End of 0044_treasurer_recorded_needs_auditor.sql
-- =====================================================================
