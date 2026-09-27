-- =====================================================================
-- KapitPondo — 0009 Functions: identity & access
-- Who is calling, what role they hold, and the auth.users → members hook.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Current caller
-- ---------------------------------------------------------------------

create or replace function public.current_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from members where auth_id = auth.uid()
$$;

create or replace function public.has_group_role(p_group_id uuid, p_roles text[] default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where group_id = p_group_id
      and member_id = public.current_member_id()
      and status = 'active'
      and (p_roles is null or role::text = any (p_roles))
  )
$$;

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

-- ---------------------------------------------------------------------
-- Role lookups
-- ---------------------------------------------------------------------

create or replace function member_group_role(p_group_id uuid, p_member_id uuid)
returns text language sql stable security definer as $$
  select role::text from memberships
  where group_id = p_group_id and member_id = p_member_id and status = 'active'
  limit 1;
$$;

create or replace function group_has_role(p_group_id uuid, p_role text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from memberships
    where group_id = p_group_id and role::text = p_role and status = 'active'
  );
$$;

-- Friendly name for error messages.
create or replace function role_label(p_role text)
returns text language sql immutable as $$
  select case p_role when 'owner' then 'Organizer' when 'treasurer' then 'Treasurer' when 'auditor' then 'Auditor' else 'Member' end;
$$;

-- ---------------------------------------------------------------------
-- Account bootstrap
-- ---------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.members (
    auth_id, email, phone, full_name, verification_status,
    consent_version, consent_accepted_at
  )
  values (
    new.id,
    coalesce(new.email, new.raw_user_meta_data->>'email'),
    new.phone,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, new.phone, ''), '@', 1)),
    'unverified',
    new.raw_user_meta_data->>'consent_version',
    case when new.raw_user_meta_data->>'consent_version' is not null then now() else null end
  )
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

-- auth.users lives outside public, so a reset may leave the old trigger behind.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function get_or_create_member()
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member members;
  v_email  text;
  v_name   text;
begin
  -- Fast path: row already exists
  select * into v_member
  from members
  where auth_id = auth.uid();

  if found then
    return v_member;
  end if;

  -- Pull email + name from auth.users (readable inside security definer)
  select
    u.email,
    coalesce(
      u.raw_user_meta_data->>'full_name',
      nullif(trim(
        coalesce(u.raw_user_meta_data->>'first_name', '') || ' ' ||
        coalesce(u.raw_user_meta_data->>'last_name',  '')
      ), ''),
      split_part(u.email, '@', 1)
    )
  into v_email, v_name
  from auth.users u
  where u.id = auth.uid();

  -- Insert, ignoring a race-condition duplicate
  insert into members (auth_id, email, full_name, verification_status)
  values (auth.uid(), v_email, v_name, 'unverified')
  on conflict (auth_id) do nothing;

  -- Return the (possibly just-inserted) row
  select * into v_member
  from members
  where auth_id = auth.uid();

  return v_member;
end;
$$;
