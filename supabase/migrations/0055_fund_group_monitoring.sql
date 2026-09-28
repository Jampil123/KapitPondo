-- =====================================================================
-- KapitPondo — Migration 0055
-- Fund Group Monitoring: a read-only, platform-wide overview of every
-- Fund Group for the System Administrator's admin console
-- (GET /admin/monitoring/fund-groups).
--
-- Strictly a SELECT — the sysadmin observes groups but never approves
-- their contributions or loans; those stay with each group's officers.
--
-- Figures follow the existing definitions so the admin sees the same
-- numbers the group's officers do:
--   total_contributions — contribution credits on the ledger, exactly as
--                         group_summary() (migration 0042) computes them
--   fund_balance        — group_available_cash() (migration 0003)
--   outstanding_loans   — remaining balance on disbursed loans that are
--                         still owed (active + defaulted)
-- Unlike groups_overview(), archived groups are included (status column).
-- =====================================================================

drop function if exists fund_groups_monitoring();

create or replace function fund_groups_monitoring()
returns table (
  group_id                uuid,
  group_name              text,
  fund_code               text,
  organizer_id            uuid,
  organizer_name          text,
  member_count            bigint,
  active_cycle_id         uuid,
  active_cycle_name       text,
  active_cycle_amount     numeric(14,2),
  active_cycle_frequency  text,
  total_contributions     numeric(14,2),
  outstanding_loans       numeric(14,2),
  outstanding_loan_count  bigint,
  fund_balance            numeric(14,2),
  group_status            group_status,
  created_at              timestamptz,
  last_activity_at        timestamptz
)
language sql
security definer
stable
as $$
  select
    g.id,
    g.name,
    g.fund_code,
    g.owner_id,
    o.full_name,
    (select count(*) from memberships m where m.group_id = g.id and m.status = 'active'),
    c.id,
    c.name,
    c.contribution_amount,
    c.frequency,
    (select coalesce(sum(l.amount), 0) from ledger_entries l
      where l.group_id = g.id and l.entry_type = 'contribution' and l.direction = 'credit')::numeric(14,2),
    (select coalesce(sum(ln.outstanding_balance), 0) from loans ln
      where ln.group_id = g.id and ln.status in ('active', 'defaulted'))::numeric(14,2),
    (select count(*) from loans ln
      where ln.group_id = g.id and ln.status in ('active', 'defaulted')),
    group_available_cash(g.id),
    g.status,
    g.created_at,
    -- Most recent thing that happened in the group; greatest() skips nulls.
    greatest(
      g.updated_at,
      (select max(l.posted_at)  from ledger_entries l where l.group_id = g.id),
      (select max(a.created_at) from audit_log a      where a.group_id = g.id),
      (select max(ct.updated_at) from contributions ct where ct.group_id = g.id),
      (select max(ln.updated_at) from loans ln         where ln.group_id = g.id),
      (select max(m.updated_at)  from memberships m    where m.group_id = g.id)
    )
  from groups g
  left join members o on o.id = g.owner_id
  left join cycles c on c.group_id = g.id and c.status = 'active' -- at most one (one_active_cycle_per_group)
  order by g.created_at desc;
$$;

-- Make PostgREST (supabase.rpc) see the new function immediately instead of
-- failing with "Could not find the function ... in the schema cache".
notify pgrst, 'reload schema';

-- =====================================================================
-- End of 0055_fund_group_monitoring.sql
-- =====================================================================
