-- =====================================================================
-- KapitPondo — 0062 Audit trail: Treasurer can read it, and it updates live
-- The API lets the Treasurer read the audit trail (flagging and export stay
-- with the Auditor and Organizer). The app refreshes the trail on
-- postgres_changes, but audit_log was never published to realtime, so it
-- didn't update live for anyone; RLS below decides who receives each row.
-- =====================================================================

drop policy if exists "audit_log: read as auditor or owner" on audit_log;
create policy "audit_log: read as officer"
  on audit_log for select to authenticated
  using (public.has_group_role(group_id, array['auditor', 'owner', 'treasurer']));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_log'
  ) then
    alter publication supabase_realtime add table audit_log;
  end if;
end $$;
