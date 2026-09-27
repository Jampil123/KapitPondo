-- =====================================================================
-- KapitPondo — 0013 Functions: ledger, balances & distributions
-- Balances and summaries read the ledger; adjustments, reversals and
-- dividend payouts write to it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Balances & summaries
-- ---------------------------------------------------------------------

create or replace function membership_balance(p_membership_id uuid)
returns numeric(14,2)
language sql
security definer
stable
as $$
  select coalesce(
    sum(case when direction = 'credit' then amount else -amount end),
    0
  )::numeric(14,2)
  from ledger_entries
  where membership_id = p_membership_id;
$$;

-- Cash on hand, holding back loans that were released but not yet verified.
create or replace function group_available_cash(p_group_id uuid)
returns numeric(14,2)
language sql
security definer
stable
as $$
  select (
    coalesce((select sum(case when direction = 'credit' then amount else -amount end)
              from ledger_entries where group_id = p_group_id), 0)
    - coalesce((select sum(coalesce(approved_principal, principal))
                from loans
                where group_id = p_group_id and disbursed_at is not null and disbursed_ledger_entry_id is null), 0)
  )::numeric(14,2);
$$;

create or replace function group_summary(p_group_id uuid)
returns table (
  total_contributions      numeric(14,2),
  total_loan_disbursements numeric(14,2),
  total_loan_repayments    numeric(14,2),
  total_expenses           numeric(14,2),
  total_distributions      numeric(14,2),
  available_cash           numeric(14,2),
  active_members           bigint,
  total_heads              bigint,
  pending_loans            bigint
)
language plpgsql
security definer
stable
as $$
begin
  return query
  select
    coalesce(sum(case when l.entry_type = 'contribution'      and l.direction = 'credit' then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'loan_disbursement' and l.direction = 'debit'  then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'loan_repayment'    and l.direction = 'credit' then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'expense'           and l.direction = 'debit'  then l.amount else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when l.entry_type = 'distribution'      and l.direction = 'debit'  then l.amount else 0 end), 0)::numeric(14,2),
    group_available_cash(p_group_id),
    (select count(*) from memberships m where m.group_id = p_group_id and m.status = 'active'),
    (select coalesce(sum(m.heads), 0) from memberships m where m.group_id = p_group_id and m.status = 'active'),
    (select count(*) from loans ln where ln.group_id = p_group_id and ln.status = 'pending')
  from ledger_entries l
  where l.group_id = p_group_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Adjustments & reversals
-- ---------------------------------------------------------------------

create or replace function post_adjustment(
  p_group_id      uuid,
  p_direction     text,
  p_amount        numeric,
  p_reason        text,
  p_posted_by     uuid,
  p_membership_id uuid    default null
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_ledger ledger_entries;
begin
  insert into ledger_entries (
    group_id, membership_id,
    entry_type, direction, amount,
    description, posted_by
  ) values (
    p_group_id, p_membership_id,
    'adjustment', p_direction::ledger_direction, p_amount,
    p_reason, p_posted_by
  ) returning * into v_ledger;
  return v_ledger;
end;
$$;

create or replace function reverse_ledger_entry(
  p_entry_id  uuid,
  p_reason    text,
  p_posted_by uuid
)
returns ledger_entries
language plpgsql
security definer
as $$
declare
  v_entry    ledger_entries;
  v_reversal ledger_entries;
  v_rev_dir  ledger_direction;
begin
  select * into v_entry from ledger_entries where id = p_entry_id;
  if not found then raise exception 'Ledger entry not found'; end if;

  if exists (select 1 from ledger_entries where reverses_entry_id = p_entry_id) then
    raise exception 'This entry has already been reversed';
  end if;

  if v_entry.entry_type = 'reversal' then
    raise exception 'Cannot reverse a reversal entry';
  end if;

  v_rev_dir := case when v_entry.direction = 'credit' then 'debit' else 'credit' end;

  insert into ledger_entries (
    group_id, membership_id, cycle_id,
    entry_type, direction, amount,
    source_type, source_id, reverses_entry_id,
    description, posted_by
  ) values (
    v_entry.group_id, v_entry.membership_id, v_entry.cycle_id,
    'reversal', v_rev_dir, v_entry.amount,
    v_entry.source_type, v_entry.source_id, p_entry_id,
    p_reason, p_posted_by
  ) returning * into v_reversal;

  return v_reversal;
end;
$$;

-- ---------------------------------------------------------------------
-- Distributions
-- ---------------------------------------------------------------------

create or replace function preview_distribution(
  p_group_id    uuid,
  p_period      text,
  p_declared_by uuid
)
returns distributions
language plpgsql
security definer
as $$
declare
  v_available    numeric(14,2);
  v_total_heads  integer;
  v_dist         distributions;
  v_mship        memberships;
  v_share        numeric(14,2);
begin
  select group_available_cash(p_group_id) into v_available;
  if v_available <= 0 then
    raise exception 'Nothing to distribute: available cash is %', v_available;
  end if;

  select coalesce(sum(heads), 0) into v_total_heads
  from memberships
  where group_id = p_group_id and status = 'active';

  if v_total_heads = 0 then
    raise exception 'No active members with heads assigned in this group';
  end if;

  insert into distributions (group_id, period, total_amount, status, declared_by)
  values (p_group_id, p_period, v_available, 'previewed', p_declared_by)
  returning * into v_dist;

  for v_mship in
    select * from memberships where group_id = p_group_id and status = 'active'
  loop
    v_share := round((v_available * v_mship.heads::numeric / v_total_heads), 2);
    insert into distribution_allocations (distribution_id, membership_id, amount)
    values (v_dist.id, v_mship.id, v_share);
  end loop;

  return v_dist;
end;
$$;

comment on function preview_distribution(uuid, text, uuid) is
  'Allocates available cash proportional to heads across every ACTIVE membership, '
  'regardless of verification_status. Documented policy decision (QA TC-038): '
  'verification gates privileges (creating groups, borrowing, officer roles), not '
  'ownership of capital already contributed to the fund — an Unverified member is '
  'paid out the same as everyone else.';

-- Requires 'verified': the Auditor's sign-off is a real gate before payout.
create or replace function finalize_distribution(
  p_distribution_id uuid,
  p_finalized_by    uuid
)
returns distributions
language plpgsql
security definer
as $$
declare
  v_dist      distributions;
  v_alloc     distribution_allocations;
  v_ledger    ledger_entries;
  v_curr_cash numeric(14,2);
begin
  select * into v_dist from distributions where id = p_distribution_id;
  if not found then raise exception 'Distribution not found'; end if;
  if v_dist.status <> 'verified' then
    raise exception 'Distribution is not verified (current status: %)', v_dist.status;
  end if;

  select group_available_cash(v_dist.group_id) into v_curr_cash;
  if abs(v_curr_cash - v_dist.total_amount) > 0.01 then
    raise exception 'Fund changed since preview: current=%, preview=%',
      v_curr_cash, v_dist.total_amount;
  end if;

  for v_alloc in
    select * from distribution_allocations where distribution_id = p_distribution_id
  loop
    insert into ledger_entries (
      group_id, membership_id,
      entry_type, direction, amount,
      source_type, source_id, posted_by
    ) values (
      v_dist.group_id, v_alloc.membership_id,
      'distribution', 'debit', v_alloc.amount,
      'distribution', v_dist.id, p_finalized_by
    ) returning * into v_ledger;

    update distribution_allocations
    set ledger_entry_id = v_ledger.id
    where id = v_alloc.id;
  end loop;

  update distributions set
    status       = 'finalized',
    finalized_by = p_finalized_by,
    finalized_at = now(),
    updated_at   = now()
  where id = p_distribution_id
  returning * into v_dist;

  return v_dist;
end;
$$;
