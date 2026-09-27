-- =====================================================================
-- KapitPondo — 0017 Realtime
-- Tables the app subscribes to (postgres_changes). RLS from 0015 filters
-- what each subscriber receives.
-- =====================================================================

alter publication supabase_realtime add table
  members,
  memberships,
  cycles,
  ledger_entries,
  contributions,
  penalties,
  loans,
  loan_payments,
  audit_flags,
  audit_findings,
  notifications,
  messages,
  direct_messages,
  announcements;
