-- Year-end payouts are released member by member by the Treasurer after the
-- Organizer approves, instead of all leaving the fund at approval.

alter table distribution_allocations add column if not exists released_at timestamptz;
alter table distribution_allocations add column if not exists released_by uuid references members(id);
-- Offsets the loans/penalties settled from the payout, posted at approval.
alter table distribution_allocations add column if not exists deduction_ledger_entry_id uuid references ledger_entries(id);

-- Distributions finalized before this paid everyone out at approval.
update distribution_allocations a
set released_at = d.finalized_at, released_by = d.finalized_by
from distributions d
where d.id = a.distribution_id and d.status = 'finalized' and a.released_at is null;

-- ---------------------------------------------------------------------
-- What a member is handed when their payout is released
-- ---------------------------------------------------------------------

create or replace function distribution_release_amount(a distribution_allocations)
returns numeric(14,2) language sql immutable as $$
  select greatest(
    coalesce(a.capital, 0) + coalesce(a.share, 0) - coalesce(a.loan_deduction, 0) - coalesce(a.penalty_deduction, 0),
    0
  )::numeric(14,2);
$$;

-- Approved payouts not released yet: still in the fund, but promised.
create or replace function group_unreleased_payouts(p_group_id uuid)
returns numeric(14,2) language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(distribution_release_amount(a)), 0)::numeric(14,2)
  from distribution_allocations a
  join distributions d on d.id = a.distribution_id
  where d.group_id = p_group_id and d.status = 'finalized' and a.released_at is null;
$$;
revoke execute on function group_unreleased_payouts(uuid) from public, anon, authenticated;
grant execute on function group_unreleased_payouts(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Organizer approval: settle deductions, keep the payouts in the fund
-- ---------------------------------------------------------------------

create or replace function finalize_distribution(
  p_distribution_id uuid,
  p_finalized_by    uuid
)
returns distributions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dist      distributions;
  v_alloc     distribution_allocations;
  v_now       record;
  v_loan      loans;
  v_owed      numeric(14,2);
  v_payment   loan_payments;
  v_pen       penalties;
  v_ledger    ledger_entries;
  v_curr_cash numeric(14,2);
  v_offset    numeric(14,2);
begin
  select * into v_dist from distributions where id = p_distribution_id for update;
  if not found then raise exception 'Distribution not found'; end if;
  if v_dist.status <> 'verified' then
    raise exception 'Distribution is not verified (current status: %)', v_dist.status;
  end if;
  if v_dist.capital_total is null then
    raise exception 'This preview was made with the old formula. Ask the Treasurer to prepare it again.';
  end if;

  select group_available_cash(v_dist.group_id) into v_curr_cash;
  if abs(v_curr_cash - v_dist.total_amount) > 0.01 then
    raise exception 'Fund changed since preview: current=%, preview=%',
      v_curr_cash, v_dist.total_amount;
  end if;

  create temporary table tmp_final on commit drop as
    select * from distribution_breakdown(v_dist.group_id);

  for v_alloc in
    select * from distribution_allocations where distribution_id = p_distribution_id
  loop
    select * into v_now from tmp_final b where b.membership_id = v_alloc.membership_id;
    if not found
       or abs(v_now.capital - v_alloc.capital) > 0.01
       or abs(v_now.loan_owed - v_alloc.loan_deduction) > 0.01
       or abs(v_now.penalties - v_alloc.penalty_deduction) > 0.01 then
      raise exception 'Fund changed since preview: a member''s balances moved. Ask the Treasurer to prepare it again.';
    end if;

    -- Unpaid loans are paid off out of the payout.
    for v_loan in select * from loans where membership_id = v_alloc.membership_id and status = 'active' for update loop
      v_owed := loan_amount_owed(v_loan);
      continue when v_owed <= 0;

      insert into loan_payments (
        loan_id, amount, principal_portion, interest_portion, status, payment_method, external_reference,
        recorded_by, confirmed_by, confirmed_at, approved_by, paid_date
      ) values (
        v_loan.id, v_owed, v_loan.outstanding_balance, v_owed - v_loan.outstanding_balance, 'paid', 'other', 'Year-end distribution',
        v_dist.declared_by, v_dist.verified_by, v_dist.verified_at, p_finalized_by, current_date
      ) returning * into v_payment;

      insert into ledger_entries (group_id, membership_id, cycle_id, entry_type, direction, amount, source_type, source_id, description, posted_by)
      values (v_dist.group_id, v_alloc.membership_id, v_dist.cycle_id, 'loan_repayment', 'credit', v_owed, 'loan_payment', v_payment.id, 'Paid from year-end distribution', p_finalized_by)
      returning * into v_ledger;

      update loan_payments set ledger_entry_id = v_ledger.id where id = v_payment.id;
      update loans set outstanding_balance = 0, status = 'paid', updated_at = now() where id = v_loan.id;
    end loop;

    -- Unpaid penalties, the same way.
    for v_pen in select * from penalties where membership_id = v_alloc.membership_id and status = 'pending' and amount > 0 for update loop
      insert into ledger_entries (group_id, membership_id, cycle_id, entry_type, direction, amount, source_type, source_id, description, posted_by)
      values (v_pen.group_id, v_pen.membership_id, v_pen.cycle_id, 'penalty', 'credit', v_pen.amount, 'penalty', v_pen.id, 'Paid from year-end distribution', p_finalized_by)
      returning * into v_ledger;
      update penalties set status = 'paid', ledger_entry_id = v_ledger.id, updated_at = now() where id = v_pen.id;
    end loop;

    -- The part of capital + share that paid those debts leaves the fund now (no
    -- cash moves for it), so the fund still holds exactly the cash to release.
    -- The rest leaves when the Treasurer releases it (release_distribution_payout).
    v_offset := least(
      coalesce(v_alloc.loan_deduction, 0) + coalesce(v_alloc.penalty_deduction, 0),
      coalesce(v_alloc.capital, 0) + coalesce(v_alloc.share, 0)
    );
    if v_offset > 0 then
      insert into ledger_entries (
        group_id, membership_id, cycle_id, entry_type, direction, amount, source_type, source_id, description, posted_by
      ) values (
        v_dist.group_id, v_alloc.membership_id, v_dist.cycle_id,
        'distribution', 'debit', v_offset,
        'distribution', v_dist.id, 'Year-end distribution: loans and penalties settled', p_finalized_by
      ) returning * into v_ledger;
      update distribution_allocations set deduction_ledger_entry_id = v_ledger.id where id = v_alloc.id;
    end if;

    -- Nothing to hand over: counts as released.
    if distribution_release_amount(v_alloc) <= 0 then
      update distribution_allocations set released_at = now(), released_by = p_finalized_by where id = v_alloc.id;
    end if;
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
revoke execute on function finalize_distribution(uuid, uuid) from public, anon, authenticated;
grant execute on function finalize_distribution(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- Treasurer releases one member's payout
-- ---------------------------------------------------------------------

create or replace function release_distribution_payout(p_allocation_id uuid, p_released_by uuid)
returns distribution_allocations
language plpgsql security definer
set search_path = public
as $$
declare
  v_alloc  distribution_allocations;
  v_dist   distributions;
  v_amount numeric(14,2);
  v_cash   numeric(14,2);
  v_ledger ledger_entries;
begin
  select * into v_alloc from distribution_allocations where id = p_allocation_id for update;
  if not found then raise exception 'Payout not found'; end if;
  select * into v_dist from distributions where id = v_alloc.distribution_id;
  if v_dist.status <> 'finalized' then
    raise exception 'The Organizer has to approve the distribution before payouts are released';
  end if;
  if member_group_role(v_dist.group_id, p_released_by) is distinct from 'treasurer' then
    raise exception 'Only the Treasurer can release payouts';
  end if;
  if v_alloc.released_at is not null then
    raise exception 'This payout was already released';
  end if;

  v_amount := distribution_release_amount(v_alloc);
  if v_amount > 0 then
    select group_available_cash(v_dist.group_id) into v_cash;
    if v_cash < v_amount then
      raise exception 'Not enough cash in the fund: % available, % to release', v_cash, v_amount;
    end if;
    insert into ledger_entries (
      group_id, membership_id, cycle_id, entry_type, direction, amount, source_type, source_id, description, posted_by
    ) values (
      v_dist.group_id, v_alloc.membership_id, v_dist.cycle_id,
      'distribution', 'debit', v_amount,
      'distribution', v_dist.id, 'Year-end payout released', p_released_by
    ) returning * into v_ledger;
  end if;

  update distribution_allocations
  set released_at = now(), released_by = p_released_by, ledger_entry_id = coalesce(v_ledger.id, ledger_entry_id)
  where id = p_allocation_id
  returning * into v_alloc;
  return v_alloc;
end;
$$;
revoke execute on function release_distribution_payout(uuid, uuid) from public, anon, authenticated;
grant execute on function release_distribution_payout(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- A cycle can't close while payouts are still waiting to be released
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


  select count(*) into v_n
  from distribution_allocations a join distributions d on d.id = a.distribution_id
  where d.cycle_id = p_cycle_id and d.status = 'finalized' and a.released_at is null;
  if v_n > 0 then
    kind := 'payouts'; item_count := v_n;
    label := v_n || case when v_n = 1 then ' year-end payout is' else ' year-end payouts are' end || ' still waiting to be released by the Treasurer.';
    return next;
  end if;
end;
$$;
revoke execute on function cycle_close_blockers(uuid) from public, anon, authenticated;
grant execute on function cycle_close_blockers(uuid) to service_role;
