-- =====================================================================
-- KapitPondo — Migration 0066
-- System Configuration: the System Administrator's limited, platform-level
-- settings. None of these touch a fund group's money or records.
--
--   system_settings      — key → jsonb value. Holds verification
--                          requirements, complaint categories and
--                          notification-template overrides. A missing key
--                          means "use the built-in default"
--                          (services/api/src/lib/systemConfig.js).
--   system_announcements — platform-wide notices shown in the member app.
--   system_policies      — versioned Terms / Privacy / Community policies;
--                          the latest published version of a kind is live.
--
-- All three are read and written only through the API (service role), so
-- RLS is enabled with no policies.
-- =====================================================================

create table if not exists system_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references members(id),
  updated_at  timestamptz not null default now()
);
alter table system_settings enable row level security;

create table if not exists system_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  audience    text not null default 'all' check (audience in ('all', 'officers')),
  tone        text not null default 'info' check (tone in ('info', 'warning', 'critical')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  published   boolean not null default false,
  created_by  uuid references members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_system_announcements_live on system_announcements (published, starts_at, ends_at);
alter table system_announcements enable row level security;

create table if not exists system_policies (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('terms', 'privacy', 'community')),
  title         text not null,
  body          text not null,
  version       text not null,
  published_at  timestamptz,           -- null = draft
  created_by    uuid references members(id),
  created_at    timestamptz not null default now(),
  unique (kind, version)
);
create index if not exists idx_system_policies_kind on system_policies (kind, published_at desc);
alter table system_policies enable row level security;

-- Complaint categories are now managed from System Configuration, so the
-- fixed list moves out of the schema; the API validates against the
-- configured (active) categories instead.
alter table problem_reports drop constraint if exists problem_reports_category_check;

notify pgrst, 'reload schema';

-- =====================================================================
-- End of 0066_system_configuration.sql
-- =====================================================================
