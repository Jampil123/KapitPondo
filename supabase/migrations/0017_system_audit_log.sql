-- 0011_system_audit_log.sql
-- Platform-level audit trail (CC — audit trail). Every Sysadmin decision
-- (account verified / rejected) writes one immutable row.

create table if not exists public.system_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id),   -- the sysadmin who acted
  action      text not null,                    -- e.g. 'account.verified' | 'account.rejected'
  target_type text not null,                    -- e.g. 'account'
  target_id   uuid,                             -- the affected user id
  metadata    jsonb,                            -- { reason, before, after, ... }
  created_at  timestamptz not null default now()
);

create index if not exists system_audit_log_created_idx on public.system_audit_log (created_at desc);

alter table public.system_audit_log enable row level security;

-- Admins may READ the log. Writes come from services/api via the service role
-- (which bypasses RLS), so no insert policy is exposed to clients.
drop policy if exists "sysadmin reads audit" on public.system_audit_log;
create policy "sysadmin reads audit"
  on public.system_audit_log
  for select
  using (public.is_sysadmin());