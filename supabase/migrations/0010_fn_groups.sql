-- =====================================================================
-- KapitPondo — 0010 Functions: groups, membership & cycles
-- Creating and joining groups, approving members, cycle progress and closing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------

create or replace function create_group_with_owner(
  p_name        text,
  p_fund_code   text,
  p_description text default null
)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_group     groups;
begin
  -- Resolve the calling user's member row via their JWT uid
  select id into v_member_id
  from members
  where auth_id = auth.uid();

  if not found then
    raise exception 'Member profile not found for auth user %', auth.uid();
  end if;

  insert into groups (name, fund_code, description, owner_id)
  values (p_name, p_fund_code, p_description, v_member_id)
  returning * into v_group;

  insert into memberships (member_id, group_id, role, status, joined_at)
  values (v_member_id, v_group.id, 'owner', 'active', now());

  return v_group;
end;
$$;

create or replace function join_group_by_code(p_fund_code text)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member     members;
  v_group      groups;
  v_membership memberships;
begin
  -- Resolve the calling user's member row
  select * into v_member
  from members
  where auth_id = auth.uid();

  if not found then
    raise exception 'Member profile not found. Please log out and log in again.';
  end if;

  -- Look up the group by fund code
  select * into v_group
  from groups
  where upper(fund_code) = upper(p_fund_code)
    and status = 'active';

  if not found then
    raise exception 'No active group found with code "%". Check the code and try again.', p_fund_code;
  end if;

  -- Guard against duplicate membership
  if exists (
    select 1 from memberships
    where member_id = v_member.id
      and group_id  = v_group.id
  ) then
    raise exception 'You are already a member of this group.';
  end if;

  -- Insert pending membership
  insert into memberships (member_id, group_id, role, status)
  values (v_member.id, v_group.id, 'member', 'pending')
  returning * into v_membership;

  return v_membership;
end;
$$;

-- ---------------------------------------------------------------------
-- Membership requests
-- ---------------------------------------------------------------------

create or replace function get_pending_members(p_group_id uuid)
returns table (
  id                  uuid,
  member_id           uuid,
  role                text,
  created_at          timestamptz,
  full_name           text,
  email               text,
  verification_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  select id into v_caller_id from members where auth_id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from memberships
    where member_id = v_caller_id
      and group_id  = p_group_id
      and status    = 'active'
      and role      in ('owner', 'treasurer', 'auditor')
  ) then
    raise exception 'Forbidden: you are not an officer of this group';
  end if;

  return query
  select
    m.id,
    m.member_id,
    m.role,
    m.created_at,
    mem.full_name,
    mem.email,
    mem.verification_status
  from memberships m
  join members mem on mem.id = m.member_id
  where m.group_id = p_group_id
    and m.status   = 'pending'
  order by m.created_at asc;
end;
$$;

create or replace function approve_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  select id into v_caller_id from members where auth_id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from memberships
    where member_id = v_caller_id
      and group_id  = p_group_id
      and status    = 'active'
      and role      in ('owner', 'treasurer')
  ) then
    raise exception 'Forbidden: owner or treasurer role required';
  end if;

  update memberships
  set status    = 'active',
      joined_at = now()
  where group_id  = p_group_id
    and member_id = p_member_id
    and status    = 'pending';
end;
$$;

create or replace function reject_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
begin
  select id into v_caller_id from members where auth_id = auth.uid();
  if not found then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from memberships
    where member_id = v_caller_id
      and group_id  = p_group_id
      and status    = 'active'
      and role      in ('owner', 'treasurer')
  ) then
    raise exception 'Forbidden: owner or treasurer role required';
  end if;

  delete from memberships
  where group_id  = p_group_id
    and member_id = p_member_id
    and status    = 'pending';
end;
$$;

-- ---------------------------------------------------------------------
-- Cycles
-- ---------------------------------------------------------------------

create or replace function cycle_progress(p_cycle_id uuid)
returns table (
  expected_total    numeric(14,2),
  collected_total   numeric(14,2),
  percent_collected numeric
)
language plpgsql
security definer
stable
as $$
declare
  v_group_id     uuid;
  v_contrib_amt  numeric(14,2);
  v_total_heads  integer;
  v_expected     numeric(14,2);
  v_collected    numeric(14,2);
begin
  select group_id, contribution_amount into v_group_id, v_contrib_amt
  from cycles where id = p_cycle_id;

  if not found then
    raise exception 'Cycle not found';
  end if;

  select coalesce(sum(heads), 0) into v_total_heads
  from memberships
  where group_id = v_group_id and status = 'active';

  v_expected := coalesce(v_contrib_amt, 0) * coalesce(v_total_heads, 0);

  select coalesce(sum(amount), 0) into v_collected
  from ledger_entries
  where cycle_id = p_cycle_id
    and entry_type = 'contribution'
    and direction = 'credit';

  return query select
    v_expected,
    v_collected,
    case when v_expected > 0 then round(v_collected / v_expected * 100) else 0 end;
end;
$$;

create or replace function close_cycle(p_cycle_id uuid)
returns cycles
language plpgsql
security definer
as $$
declare
  v_cycle cycles;
begin
  update cycles
  set status = 'closed', updated_at = now()
  where id = p_cycle_id and status = 'active'
  returning * into v_cycle;

  if not found then
    raise exception 'Cycle not found or not in active status';
  end if;

  return v_cycle;
end;
$$;
