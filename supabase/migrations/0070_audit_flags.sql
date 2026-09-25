-- =====================================================================
-- KapitPondo — Migration 0070
-- Audit flags: until now a flag was only an audit_log row, so it had no
-- status and no way to be closed. A flag points at one record (a
-- contribution, repayment, loan...) with a short reason, gets a per-group
-- number (FL-01, FL-02...) and stays open until the Organizer resolves it
-- (the record was corrected) or dismisses it (the record turned out right).
--
-- Same shape and rules as audit_findings (0067): writes through the API
-- (service_role), Auditor + Organizer read for realtime refresh, and the
-- Auditor never closes their own flag.
-- =====================================================================

create table if not exists audit_flags (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups(id) on delete cascade,
  seq             integer not null,
  raised_by       uuid not null references members(id),
  entity_type     text not null,
  entity_id       uuid not null,
  reason          text not null,
  note            text,
  status          text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by     uuid references members(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint audit_flags_seq_unique unique (group_id, seq),
  constraint audit_flags_not_self_resolved check (resolved_by is null or resolved_by <> raised_by)
);

create index if not exists idx_audit_flags_group on audit_flags (group_id, status, created_at desc);
create index if not exists idx_audit_flags_entity on audit_flags (entity_id);

-- Carry over flags raised before this table existed, numbered in the order they were raised.
insert into audit_flags (group_id, seq, raised_by, entity_type, entity_id, reason, note, created_at, updated_at)
select
  a.group_id,
  row_number() over (partition by a.group_id order by a.created_at),
  a.actor_id,
  a.entity_type,
  a.entity_id,
  coalesce(nullif(trim(a.after_data->>'note'), ''), 'Flagged for review'),
  null,
  a.created_at,
  a.created_at
from audit_log a
where a.action = 'flagged'
  and a.actor_id is not null
  and a.entity_id is not null
  and not exists (select 1 from audit_flags f where f.group_id = a.group_id);

alter table audit_flags enable row level security;
drop policy if exists "audit_flags: read as auditor or owner" on audit_flags;
create policy "audit_flags: read as auditor or owner"
  on audit_flags for select to authenticated
  using (public.has_group_role(group_id, array['auditor', 'owner']));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_flags'
  ) then
    alter publication supabase_realtime add table audit_flags;
  end if;
end $$;

-- =====================================================================
-- End of 0070_audit_flags.sql
-- =====================================================================
