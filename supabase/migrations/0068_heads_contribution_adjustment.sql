-- =====================================================================
-- KapitPondo — 0068 Heads change after an early contribution
-- Heads stay editable until the cycle's first due date, so a member may
-- already have paid a period at the old head count. On a heads change:
--   * heads up   → the difference stays owed on that period (amount_due)
--                  and is paid with a top-up contribution (top_up_of).
--   * heads down → the extra becomes advance credit on the membership,
--                  used toward the member's next contribution.
-- No ledger entries move: the cash was already posted when it was paid.
-- =====================================================================

alter table contributions
  add column top_up_of      uuid references contributions(id) on delete cascade,
  add column amount_due     numeric(14,2) check (amount_due is null or amount_due >= 0),
  add column credit_applied numeric(14,2) not null default 0 check (credit_applied >= 0),
  add column credit_granted numeric(14,2) not null default 0 check (credit_granted >= 0);

comment on column contributions.top_up_of is
  'Set on a payment that covers the unpaid balance of an earlier period''s row. Not a period of its own.';
comment on column contributions.amount_due is
  'What the period requires when it differs from what was paid (heads changed after paying). Null = amount + credit_applied.';
comment on column contributions.credit_applied is
  'Advance credit used toward this period. Taken from memberships.contribution_credit when the row is approved.';
comment on column contributions.credit_granted is
  'Part of this row''s payment that exceeded amount_due and was moved to memberships.contribution_credit.';

create index idx_contributions_top_up_of on contributions (top_up_of) where top_up_of is not null;

alter table memberships
  add column contribution_credit numeric(14,2) not null default 0 check (contribution_credit >= 0);

comment on column memberships.contribution_credit is
  'Advance credit from an earlier overpayment (heads lowered after paying), used toward the next contribution.';

-- ---------------------------------------------------------------------
-- Heads change: re-price every period already paid in the active cycle
-- ---------------------------------------------------------------------

create or replace function set_membership_heads(p_membership_id uuid, p_heads integer)
returns memberships
language plpgsql
security definer
as $$
declare
  v_m     memberships;
  v_cycle cycles;
  v_row   contributions;
  v_due   numeric;
  v_paid  numeric;
  v_extra numeric;
  v_delta numeric := 0;
begin
  if p_heads is null or p_heads < 1 then raise exception 'Heads must be at least 1'; end if;

  select * into v_m from memberships where id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;

  select * into v_cycle from cycles where group_id = v_m.group_id and status = 'active' limit 1;
  if found then
    if exists (
      select 1 from contributions
      where membership_id = p_membership_id and cycle_id = v_cycle.id and status in ('submitted', 'confirmed')
    ) then
      raise exception 'A contribution of yours is still under review. Change your heads once it''s verified.';
    end if;

    v_due := v_cycle.contribution_amount * p_heads;
    for v_row in
      select * from contributions
      where membership_id = p_membership_id and cycle_id = v_cycle.id
        and top_up_of is null and status = 'approved'
      for update
    loop
      v_paid := v_row.amount + v_row.credit_applied
        + coalesce((select sum(t.amount) from contributions t where t.top_up_of = v_row.id and t.status = 'approved'), 0);
      v_extra := greatest(v_paid - v_due, 0);
      v_delta := v_delta + v_extra - v_row.credit_granted;
      update contributions set amount_due = v_due, credit_granted = v_extra, updated_at = now()
      where id = v_row.id;
    end loop;
  end if;

  if v_m.contribution_credit + v_delta < 0 then
    raise exception 'The credit from your earlier payment has already been used, so your heads can''t go up right now.';
  end if;

  update memberships set heads = p_heads, contribution_credit = contribution_credit + v_delta
  where id = p_membership_id
  returning * into v_m;
  return v_m;
end;
$$;

-- ---------------------------------------------------------------------
-- A period fully covered by credit: no money moves, so nothing to confirm
-- or verify and nothing posts to the ledger.
-- ---------------------------------------------------------------------

create or replace function apply_contribution_credit(
  p_membership_id uuid,
  p_cycle_id      uuid,
  p_amount        numeric,
  p_actor_id      uuid
)
returns contributions
language plpgsql
security definer
as $$
declare
  v_m        memberships;
  v_reserved numeric;
  v_c        contributions;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'There is no credit to apply'; end if;

  select * into v_m from memberships where id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;

  select coalesce(sum(credit_applied), 0) into v_reserved
  from contributions where membership_id = p_membership_id and status in ('submitted', 'confirmed');
  if v_m.contribution_credit - v_reserved < p_amount then
    raise exception 'Not enough advance credit to cover this contribution';
  end if;

  insert into contributions (
    membership_id, cycle_id, group_id, amount, amount_due, credit_applied,
    status, paid_date, recorded_by
  ) values (
    p_membership_id, p_cycle_id, v_m.group_id, 0, p_amount, p_amount,
    'approved', current_date, p_actor_id
  ) returning * into v_c;

  update memberships set contribution_credit = contribution_credit - p_amount where id = p_membership_id;
  return v_c;
end;
$$;

-- ---------------------------------------------------------------------
-- verify_contribution: as in 0011, plus credit used toward the period is
-- taken off the membership's balance when the row is approved.
-- ---------------------------------------------------------------------

create or replace function verify_contribution(p_contribution_id uuid, p_verifier_id uuid)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_c          contributions;
  v_ledger     ledger_entries;
  v_payer      uuid;
  v_payer_role text;
  v_role       text;
  v_needed     text;
begin
  select * into v_c from contributions where id = p_contribution_id for update;
  if not found then raise exception 'Contribution not found'; end if;
  if v_c.status <> 'confirmed' then raise exception 'Contribution is not waiting for verification'; end if;

  select member_id into v_payer from memberships where id = v_c.membership_id;
  if p_verifier_id = v_payer then raise exception 'You cannot verify your own contribution'; end if;
  if p_verifier_id = v_c.recorded_by then raise exception 'You cannot verify a contribution you recorded'; end if;
  if p_verifier_id = v_c.confirmed_by then raise exception 'The person who confirmed a contribution cannot also verify it'; end if;

  v_payer_role := member_group_role(v_c.group_id, v_payer);
  v_role       := member_group_role(v_c.group_id, p_verifier_id);
  v_needed     := money_in_verify_role(v_c.group_id, v_payer_role, member_group_role(v_c.group_id, v_c.recorded_by));
  if v_role is distinct from v_needed then
    raise exception 'This contribution must be verified by the %', role_label(v_needed);
  end if;

  if v_c.credit_applied > 0 then
    update memberships set contribution_credit = contribution_credit - v_c.credit_applied
    where id = v_c.membership_id and contribution_credit >= v_c.credit_applied;
    if not found then raise exception 'Not enough advance credit left for this contribution'; end if;
  end if;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, posted_by
  ) values (
    v_c.group_id, v_c.membership_id, v_c.cycle_id,
    'contribution', 'credit', v_c.amount,
    'contribution', v_c.id, p_verifier_id
  ) returning * into v_ledger;

  update contributions set
    status          = 'approved',
    approved_by     = p_verifier_id,
    paid_date       = current_date,
    ledger_entry_id = v_ledger.id,
    updated_at      = now()
  where id = p_contribution_id;

  return v_ledger;
end;
$$;

-- ---------------------------------------------------------------------
-- An approved row leaving 'approved' (a reversal, 0063) gives back the
-- credit it used and takes back the credit it created.
-- ---------------------------------------------------------------------

create or replace function contributions_unapprove_credit()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.status = 'approved' and new.status <> 'approved'
     and (old.credit_applied > 0 or old.credit_granted > 0) then
    update memberships
    set contribution_credit = contribution_credit + old.credit_applied - old.credit_granted
    where id = old.membership_id
      and contribution_credit + old.credit_applied - old.credit_granted >= 0;
    if not found then
      raise exception 'The advance credit from this contribution has already been used toward a later one. Reverse that one first.';
    end if;
    new.credit_granted := 0;
  end if;
  return new;
end;
$$;

create trigger trg_contributions_unapprove_credit
  before update of status on contributions
  for each row execute function contributions_unapprove_credit();

-- Money functions: API (service_role) only — see 0015.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_membership_heads', 'apply_contribution_credit', 'verify_contribution')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
