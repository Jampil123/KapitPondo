-- =====================================================================
-- KapitPondo — Migration 0011
-- Adds cycle_progress(p_cycle_id): expected vs collected contributions
-- for a cycle, powering the owner dashboard's fund-hero progress bar.
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
  v_group_id    uuid;
  v_contrib_amt numeric(14,2);
  v_members     integer;
  v_expected    numeric(14,2);
  v_collected   numeric(14,2);
begin
  select group_id, contribution_amount into v_group_id, v_contrib_amt
  from cycles where id = p_cycle_id;

  if not found then
    raise exception 'Cycle not found';
  end if;

  select count(*) into v_members
  from memberships
  where group_id = v_group_id and status = 'active';

  v_expected := coalesce(v_contrib_amt, 0) * coalesce(v_members, 0);

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
-- End of 0011_cycle_progress_rpc.sql
-- =====================================================================
