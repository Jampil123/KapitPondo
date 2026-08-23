-- =====================================================================
-- KapitPondo — Migration 0036
-- Wires the Penalties Review screen up to real data (it was a static "not
-- enabled yet" placeholder even though the backend list/waive endpoints
-- already existed). Adds `penalties` to the realtime publication so it
-- fits the same live-refresh pattern as the other dashboard-driving tables
-- from migration 0035 — a penalty charged or waived by one officer updates
-- everyone's screen instantly, not just on next remount.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'penalties'
  ) then
    alter publication supabase_realtime add table penalties;
  end if;
end $$;

-- =====================================================================
-- End of 0036_penalties_realtime.sql
-- =====================================================================
