-- =====================================================================
-- KapitPondo — Migration 0067
-- Audit findings: a formal record the Auditor submits (what's wrong, how
-- serious, optionally which posting it's about) that the Organizer then
-- resolves or dismisses with a note. A flag (audit-log/flag) is a quick
-- one-line concern; a finding is tracked until someone closes it.
--
-- Only the Organizer closes a finding, so the Auditor never signs off on
-- their own discrepancy. Writes go through the API (service_role); the app
-- reads for realtime refresh, same pattern as 0066.
-- =====================================================================

create table if not exists audit_findings (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups(id) on delete cascade,
  raised_by       uuid not null references members(id),
  title           text not null,
  details         text,
  severity        text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  entity_type     text,
  entity_id       uuid,
  status          text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by     uuid references members(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint audit_findings_not_self_resolved check (resolved_by is null or resolved_by <> raised_by)
);

create index if not exists idx_audit_findings_group on audit_findings (group_id, status, created_at desc);

alter table audit_findings enable row level security;
drop policy if exists "audit_findings: read as auditor or owner" on audit_findings;
create policy "audit_findings: read as auditor or owner"
  on audit_findings for select to authenticated
  using (public.has_group_role(group_id, array['auditor', 'owner']));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_findings'
  ) then
    alter publication supabase_realtime add table audit_findings;
  end if;
end $$;

-- =====================================================================
-- End of 0067_audit_findings.sql
-- =====================================================================
