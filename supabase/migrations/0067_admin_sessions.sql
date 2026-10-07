-- =====================================================================
-- KapitPondo — 0067 Admin session list
-- auth.sessions isn't exposed through PostgREST, so the admin console's
-- Account Settings ("active sessions") reads it through this function.
-- Service role only: services/api passes the signed-in admin's own auth id.
-- =====================================================================

create or replace function public.auth_sessions_for(p_user_id uuid)
returns table (
  id           uuid,
  created_at   timestamptz,
  last_active  timestamptz,
  user_agent   text,
  ip           text,
  not_after    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) as last_active,
         s.user_agent,
         host(s.ip),
         s.not_after
  from auth.sessions s
  where s.user_id = p_user_id
    and (s.not_after is null or s.not_after > now())
  order by 3 desc;
$$;

revoke all on function public.auth_sessions_for(uuid) from public, anon, authenticated;
grant execute on function public.auth_sessions_for(uuid) to service_role;
