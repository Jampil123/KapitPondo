-- =====================================================================
-- KapitPondo — 0073 Close Fund Cycle (UC-FC-02)
--
-- * A year-end distribution now belongs to the cycle it was prepared in
--   (cycle_id was never filled, so "is this cycle's distribution
--   finalized?" could not be answered).
-- * cycle_close_blockers(): what still stops a cycle from closing — the
--   distribution not finalized (E1), or submissions / reversals still
--   waiting for a decision (E2).
-- * close_cycle(): Organizer only, refuses while anything blocks it,
--   records who closed it and when.
-- * A closed cycle is read-only: its settings and its contributions can't
--   change. (Penalties stay payable — an unpaid one is still owed.)
-- =====================================================================

alter table cycles add column if not exists closed_at timestamptz;
alter table cycles add column if not exists closed_by uuid references members(id);

-- ---------------------------------------------------------------------
-- Distributions belong to a cycle
-- ---------------------------------------------------------------------

create or replace function set_distribution_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cycle_id is null then
    select id into new.cycle_id from cycles
    where group_id = new.group_id and status = 'active'
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_distributions_cycle on distributions;
create trigger trg_distributions_cycle before insert on distributions
  for each row execute function set_distribution_cycle();

-- Existing rows: the latest cycle that had started when it was prepared.
update distributions d set cycle_id = (
  select c.id from cycles c
  where c.group_id = d.group_id and c.status <> 'draft' and c.start_date <= d.created_at::date
  order by c.start_date desc
  limit 1
)
where d.cycle_id is null;

-- ---------------------------------------------------------------------
-- What stops a cycle from closing
-- ---------------------------------------------------------------------

create or replace function cycle_close_blockers(p_cycle_id uuid)
returns table (kind text, label text, item_count integer)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_c    cycles;
  v_dist distribution_status;
  v_n    integer;
begin
  select * into v_c from cycles where id = p_cycle_id;
  if not found then raise exception 'Cycle not found'; end if;

  -- E1 — the year-end distribution
  select d.status into v_dist from distributions d
  where d.cycle_id = p_cycle_id and d.status <> 'draft'
  order by (d.status = 'finalized') desc, d.created_at desc
  limit 1;
  if v_dist is distinct from 'finalized' then
    kind := 'distribution';
    item_count := 1;
    label := case v_dist
      when 'previewed' then 'The year-end distribution is waiting for the Auditor''s verification.'
      when 'verified'  then 'The year-end distribution is verified but not finalized yet.'
      else 'The year-end distribution hasn''t been prepared yet.'
    end;
    return next;
  end if;

  -- E2 — anything still waiting for a decision
  select count(*) into v_n from contributions c
  where c.group_id = v_c.group_id and c.status in ('submitted', 'confirmed');
  if v_n > 0 then
    kind := 'contributions'; item_count := v_n;
    label := v_n || case when v_n = 1 then ' contribution is' else ' contributions are' end || ' waiting for sign-off.';
    return next;
  end if;

  select count(*) into v_n from loan_payments p join loans l on l.id = p.loan_id
  where l.group_id = v_c.group_id and p.status in ('submitted', 'confirmed');
  if v_n > 0 then
    kind := 'repayments'; item_count := v_n;
    label := v_n || case when v_n = 1 then ' loan repayment is' else ' loan repayments are' end || ' waiting for sign-off.';
    return next;
  end if;

  select count(*) into v_n from loans l
  where l.group_id = v_c.group_id and l.status in ('pending', 'approved');
  if v_n > 0 then
    kind := 'loan_requests'; item_count := v_n;
    label := v_n || case when v_n = 1 then ' loan request is' else ' loan requests are' end || ' waiting for a decision or release.';
    return next;
  end if;

  select count(*) into v_n from loans l
  where l.group_id = v_c.group_id and l.status = 'active' and l.disbursed_ledger_entry_id is null;
  if v_n > 0 then
    kind := 'loan_releases'; item_count := v_n;
    label := v_n || case when v_n = 1 then ' loan release is' else ' loan releases are' end || ' waiting for verification.';
    return next;
  end if;

  select count(*) into v_n from ledger_reversal_requests r
  where r.group_id = v_c.group_id and r.status in ('pending_verification', 'verified');
  if v_n > 0 then
    kind := 'reversals'; item_count := v_n;
    label := v_n || case when v_n = 1 then ' reversal is' else ' reversals are' end || ' waiting for a decision.';
    return next;
  end if;

  select count(*) into v_n from withdrawals w
  where w.group_id = v_c.group_id and w.status in ('pending_release', 'released');
  if v_n > 0 then
    kind := 'withdrawals'; item_count := v_n;
    label := v_n || case when v_n = 1 then ' member withdrawal is' else ' member withdrawals are' end || ' still in progress.';
    return next;
  end if;
end;
$$;
revoke execute on function cycle_close_blockers(uuid) from public, anon, authenticated;
grant execute on function cycle_close_blockers(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Close (Organizer only)
-- ---------------------------------------------------------------------

drop function if exists close_cycle(uuid);

create or replace function close_cycle(p_cycle_id uuid, p_actor_id uuid)
returns cycles
language plpgsql security definer
set search_path = public
as $$
declare
  v_c        cycles;
  v_blockers text;
begin
  select * into v_c from cycles where id = p_cycle_id for update;
  if not found then raise exception 'Cycle not found'; end if;
  if member_group_role(v_c.group_id, p_actor_id) is distinct from 'owner' then
    raise exception 'Only the Organizer can close a cycle';
  end if;
  if v_c.status <> 'active' then raise exception 'Only an active cycle can be closed'; end if;

  select string_agg(b.label, ' ') into v_blockers from cycle_close_blockers(p_cycle_id) b;
  if v_blockers is not null then raise exception '%', v_blockers; end if;

  update cycles set status = 'closed', closed_at = now(), closed_by = p_actor_id, updated_at = now()
  where id = p_cycle_id
  returning * into v_c;
  return v_c;
end;
$$;
revoke execute on function close_cycle(uuid, uuid) from public, anon, authenticated;
grant execute on function close_cycle(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- A closed cycle is read-only
-- ---------------------------------------------------------------------

create or replace function guard_closed_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'closed' then
    raise exception 'This cycle is closed. Its records can''t be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cycles_closed_guard on cycles;
create trigger trg_cycles_closed_guard before update on cycles
  for each row execute function guard_closed_cycle();

create or replace function guard_closed_cycle_contribution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from cycles c
    where c.status = 'closed'
      and (c.id = new.cycle_id or (tg_op = 'UPDATE' and c.id = old.cycle_id))
  ) then
    raise exception 'This cycle is closed. Its records can''t be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contributions_closed_guard on contributions;
create trigger trg_contributions_closed_guard before insert or update on contributions
  for each row execute function guard_closed_cycle_contribution();
