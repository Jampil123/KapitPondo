-- =====================================================================
-- KapitPondo — Migration 0064
-- Policy change: a contribution an officer records for another member
-- ("Record new" — a walk-in, usually cash handed over in person) now posts
-- to the ledger immediately. It no longer waits in the 'submitted' queue
-- for the Organizer to confirm (migration 0062).
--
-- Scope, on purpose:
--   * Only walk-ins for SOMEONE ELSE. An officer's own contribution still
--     goes through approve_contribution and needs a different officer —
--     posting your own money unchecked isn't part of this change.
--   * Loan repayments are unchanged (confirm_loan_repayment, 0063).
--
-- The recording officer is the poster and the approver of record, so the
-- ledger and the audit log still say who put the money in.
-- =====================================================================

create or replace function post_walk_in_contribution(
  p_contribution_id uuid,
  p_recorder_id     uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_contrib        contributions;
  v_ledger         ledger_entries;
  v_recorder_role  text;
  v_target_member  uuid;
begin
  select * into v_contrib from contributions where id = p_contribution_id;
  if not found then
    raise exception 'Contribution not found';
  end if;
  if v_contrib.status <> 'submitted' then
    raise exception 'Contribution is not pending';
  end if;
  if not v_contrib.is_walk_in or v_contrib.recorded_by is distinct from p_recorder_id then
    raise exception 'Only a walk-in recorded by this officer can be posted directly';
  end if;

  select role into v_recorder_role
  from memberships
  where member_id = p_recorder_id and group_id = v_contrib.group_id and status = 'active';
  if v_recorder_role is null or v_recorder_role not in ('treasurer', 'auditor', 'owner') then
    raise exception 'Only an officer can record a walk-in contribution';
  end if;

  select member_id into v_target_member from memberships where id = v_contrib.membership_id;
  if v_target_member = p_recorder_id then
    raise exception 'Your own contribution still needs another officer to confirm it';
  end if;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_contrib.group_id, v_contrib.membership_id, v_contrib.cycle_id,
    'contribution', 'credit', v_contrib.amount,
    'contribution', v_contrib.id, p_recorder_id
  ) returning * into v_ledger;

  update contributions set
    status          = 'approved',
    approved_by     = p_recorder_id,
    paid_date       = current_date,
    ledger_entry_id = v_ledger.id,
    updated_at      = now()
  where id = p_contribution_id;

  return v_ledger;
end;
$$;
