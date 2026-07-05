-- 0010_platform_admins.sql
-- Platform-admin (Sysadmin) role. No self-signup: rows are seeded server-side.
-- The static admin is a normal Supabase auth user whose id is listed here.

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  active     boolean not null default true
);

-- Helper: is the CURRENT user an active platform admin?
-- SECURITY DEFINER so it can read platform_admins from inside RLS policies
-- without causing recursion, and without granting clients table access.
create or replace function public.is_sysadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and active = true
  );
$$;

revoke all on function public.is_sysadmin() from public;
grant execute on function public.is_sysadmin() to authenticated;

-- RLS: an admin may READ the admin list; NOBODY may write via the client.
-- (Grants/revocations happen through the service role: seed script or dashboard.)
alter table public.platform_admins enable row level security;

drop policy if exists "sysadmin reads admins" on public.platform_admins;
create policy "sysadmin reads admins"
  on public.platform_admins
  for select
  using (public.is_sysadmin());
-- No insert/update/delete policies → only the service role can modify.