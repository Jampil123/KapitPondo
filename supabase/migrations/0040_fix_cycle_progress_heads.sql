-- =====================================================================
-- KapitPondo — Migration 0040
-- Fixes cycle_progress(): expected_total was contribution_amount × COUNT
-- of active members, silently treating every member as 1 head. A member
-- with heads > 1 (a household paying for multiple slots) was undercounted,
-- so expected_total came out too low and percent_collected too high.
-- Should be contribution_amount × SUM(heads) — memberships.heads is
-- `not null default 1` (see migration 0002), so a member who never set
-- heads explicitly already reads as 1 with no extra handling needed here.
-- =====================================================================

drop function if exists cycle_progress(uuid);
create or replace function cycle_progress(p_cycle_id uuid)
returns table (
  expected_total    numeric(14,2),
  collected_total   numeric(14,2),
  percent_collected numeric
)
language plpgsql
security definer
stable
as $$
declare
  v_group_id     uuid;
  v_contrib_amt  numeric(14,2);
  v_total_heads  integer;
  v_expected     numeric(14,2);
  v_collected    numeric(14,2);
begin
  select group_id, contribution_amount into v_group_id, v_contrib_amt
  from cycles where id = p_cycle_id;

  if not found then
    raise exception 'Cycle not found';
  end if;

  select coalesce(sum(heads), 0) into v_total_heads
  from memberships
  where group_id = v_group_id and status = 'active';

  v_expected := coalesce(v_contrib_amt, 0) * coalesce(v_total_heads, 0);

  select coalesce(sum(amount), 0) into v_collected
  from ledger_entries
  where cycle_id = p_cycle_id
    and entry_type = 'contribution'
    and direction = 'credit';

  return query select
    v_expected,
    v_collected,
    case when v_expected > 0 then round(v_collected / v_expected * 100) else 0 end;
end;
$$;

-- =====================================================================
-- End of 0040_fix_cycle_progress_heads.sql
-- =====================================================================
