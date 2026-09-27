-- =====================================================================
-- KapitPondo — 0007 Oversight & auditing
-- =====================================================================

-- Group activity trail. Append-only for every role, service_role included.
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references members(id),
  actor_role  text,
  group_id    uuid references groups(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz not null default now()
);
create index idx_audit_group              on audit_log (group_id);
create index idx_audit_log_group_created  on audit_log (group_id, created_at desc);
create index idx_audit_log_group_entity   on audit_log (group_id, entity_type, created_at desc);

create trigger audit_log_no_update before update on audit_log
  for each row execute function prevent_audit_log_mutation();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function prevent_audit_log_mutation();

-- Auditor flags on individual records, numbered per group.
create table audit_flags (
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
create index idx_audit_flags_group  on audit_flags (group_id, status, created_at desc);
create index idx_audit_flags_entity on audit_flags (entity_id);

-- Formal findings, optionally rolling up several flags (flag_ids).
create table audit_findings (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups(id) on delete cascade,
  seq             integer not null,
  raised_by       uuid not null references members(id),
  title           text not null,
  details         text,
  recommendation  text,
  severity        text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  entity_type     text,
  entity_id       uuid,
  flag_ids        uuid[] not null default '{}',   -- audit_flags.id (no FK on array elements)
  status          text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by     uuid references members(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint audit_findings_seq_unique unique (group_id, seq),
  constraint audit_findings_not_self_resolved check (resolved_by is null or resolved_by <> raised_by)
);
create index idx_audit_findings_group on audit_findings (group_id, status, created_at desc);
