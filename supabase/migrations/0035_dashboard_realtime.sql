-- =====================================================================
-- KapitPondo — Migration 0035
-- Every dashboard number (available cash, pending contributions/loans/
-- expenses, recent activity, cycle progress, membership requests) was only
-- ever loaded once on mount — one officer approving something never reached
-- anyone else's already-open dashboard until they pulled to refresh. This
-- adds the tables that actually drive those numbers to the realtime
-- publication, alongside the app-side subscribe-and-refetch wiring added to
-- useQuery() (apps/mobile/src/hooks/useApi.ts) and the feature hooks that
-- use it. RLS already governs what each caller may read (same policies used
-- for the normal REST fetches); this only makes those same rows streamable.
--
-- Guarded with an existence check (unlike 0022/0023/0030's bare
-- `alter publication ... add table`) since this adds several tables in one
-- migration — a rerun or partial-apply shouldn't error on tables already
-- present.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['contributions', 'loans', 'loan_payments', 'expenses', 'ledger_entries', 'cycles', 'memberships']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- End of 0035_dashboard_realtime.sql
-- =====================================================================
