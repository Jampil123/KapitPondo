-- =====================================================================
-- KapitPondo — 0074 Prepare Distribution Preview (UC-YD-01)
--
-- Payout formula (replaces "all cash split by heads"):
--
--   payout = capital + share of net income − unpaid loan − unpaid penalties
--
--   capital     — the member's own contributions since the last finalized
--                 distribution (same rule as withdrawal_settlement).
--   net income  — what the fund earned on top of capital: available cash
--                 plus everything still owed to it, minus all capital.
--                 Shared by each member's heads at the time of the preview.
--   deductions  — unpaid loans and penalties, settled out of the payout
--                 when the Organizer finalizes (as a withdrawal does).
--
-- Total payouts therefore equal the cash the fund holds, so
-- finalize_distribution's "fund changed since preview" check still holds.
--
-- Flow: Treasurer prepares a 'draft' (only they see it) → submits it →
-- 'previewed', the Auditor is notified. Preparing is refused while the
-- cycle hasn't ended (E1), anything is pending (E2), or a member owes more
-- than their payout (A3).
-- =====================================================================

alter table distributions add column if not exists capital_total    numeric(14,2);
alter table distributions add column if not exists net_income       numeric(14,2);
alter table distributions add column if not exists interest_income  numeric(14,2);
alter table distributions add column if not exists penalty_income   numeric(14,2);
alter table distributions add column if not exists deductions_total numeric(14,2);
alter table distributions add column if not exists total_heads      integer;
alter table distributions add column if not exists submitted_by     uuid references members(id);
alter table distributions add column if not exists submitted_at     timestamptz;

alter table distribution_allocations add column if not exists heads             integer;
alter table distribution_allocations add column if not exists capital           numeric(14,2);
alter table distribution_allocations add column if not exists share             numeric(14,2);
alter table distribution_allocations add column if not exists loan_deduction    numeric(14,2);
alter table distribution_allocations add column if not exists penalty_deduction numeric(14,2);

-- ---------------------------------------------------------------------
-- Per-member figures, before rounding is balanced
-- ---------------------------------------------------------------------

create or replace function distribution_breakdown(p_group_id uuid)
returns table (
  membership_id uuid, heads integer, capital numeric, share numeric,
  loan_owed numeric, penalties numeric, payout numeric
)
language sql stable security definer
set search_path = public
as $$
  with since as (
    select max(finalized_at) as t from distributions
    where group_id = p_group_id and status = 'finalized'
  ),
  m as (
    select ms.id, ms.heads from memberships ms
    where ms.group_id = p_group_id and ms.status in ('active', 'suspended') and ms.heads > 0
  ),
  fig as (
    select
      m.id, m.heads,
      greatest(coalesce((
        select sum(case when e.entry_type = 'contribution' then e.amount else -e.amount end)
        from ledger_entries e, since
        where e.membership_id = m.id
          and (since.t is null or e.posted_at > since.t)
          and (
            (e.entry_type = 'contribution' and e.direction = 'credit')
            or (e.entry_type = 'reversal' and e.reverses_entry_id in (
                  select c.id from ledger_entries c where c.membership_id = m.id and c.entry_type = 'contribution'))
          )
      ), 0), 0)::numeric(14,2) as capital,
      coalesce((select sum(loan_amount_owed(l)) from loans l where l.membership_id = m.id and l.status = 'active'), 0)::numeric(14,2) as loan_owed,
      coalesce((select sum(p.amount) from penalties p where p.membership_id = m.id and p.status = 'pending'), 0)::numeric(14,2) as penalties
    from m
  ),
  tot as (
    select
      coalesce(sum(fig.heads), 0) as heads,
      group_available_cash(p_group_id) + coalesce(sum(fig.loan_owed + fig.penalties), 0) - coalesce(sum(fig.capital), 0) as net
    from fig
  )
  select
    fig.id, fig.heads, fig.capital,
    round(case when tot.heads > 0 then tot.net * fig.heads / tot.heads else 0 end, 2),
    fig.loan_owed, fig.penalties,
    round(fig.capital + case when tot.heads > 0 then tot.net * fig.heads / tot.heads else 0 end - fig.loan_owed - fig.penalties, 2)
  from fig, tot;
$$;
revoke execute on function distribution_breakdown(uuid) from public, anon, authenticated;
grant execute on function distribution_breakdown(uuid) to service_role;

-- ---------------------------------------------------------------------
-- What stops the Treasurer from preparing a preview (E1, E2, A3)
-- ---------------------------------------------------------------------

create or replace function distribution_readiness(p_group_id uuid)
returns table (kind text, label text, item_count integer)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_c cycles;
  v_b record;
begin
  select * into v_c from cycles where group_id = p_group_id and status = 'active' limit 1;
  if not found then
    kind := 'no_cycle'; item_count := 1; label := 'There is no active cycle to distribute.';
    return next;
    return;
  end if;

  -- E1
  if v_c.end_date is null then
    kind := 'cycle_not_ended'; item_count := 1;
    label := 'The cycle has no end date yet. Set one before preparing the distribution.';
    return next;
  elsif v_c.end_date >= current_date then
    kind := 'cycle_not_ended'; item_count := 1;
    label := 'The cycle ends on ' || to_char(v_c.end_date, 'FMMon FMDD, YYYY') || '. You can prepare the distribution after that.';
    return next;
  end if;

  if exists (select 1 from distributions d where d.group_id = p_group_id and d.status = 'verified') then
    kind := 'verified'; item_count := 1;
    label := 'A distribution is already verified and waiting for the Organizer.';
    return next;
  end if;

  -- E2 — the same pending items that stop a cycle from closing
  for v_b in select * from cycle_close_blockers(v_c.id) b where b.kind <> 'distribution' loop
    kind := v_b.kind; label := v_b.label; item_count := v_b.item_count;
    return next;
  end loop;

  -- A3
  for v_b in
    select coalesce(mem.full_name, 'A member') as name, -b.payout as short
    from distribution_breakdown(p_group_id) b
    join memberships ms on ms.id = b.membership_id
    left join members mem on mem.id = ms.member_id
    where b.payout < 0
  loop
    kind := 'owes_more'; item_count := 1;
    label := v_b.name || ' owes ₱' || to_char(v_b.short, 'FM999,999,990.00') || ' more than their payout and needs to pay the difference first.';
    return next;
  end loop;
end;
$$;
revoke execute on function distribution_readiness(uuid) from public, anon, authenticated;
grant execute on function distribution_readiness(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Prepare (Treasurer) — replaces any open draft or unverified preview
-- ---------------------------------------------------------------------

drop function if exists preview_distribution(uuid, text, uuid);

create or replace function preview_distribution(p_group_id uuid, p_declared_by uuid)
returns distributions
language plpgsql security definer
set search_path = public
as $$
declare
  v_c         cycles;
  v_blockers  text;
  v_dist      distributions;
  v_since     timestamptz;
  v_heads     integer;
  v_capital   numeric(14,2);
  v_net       numeric(14,2);
  v_ded       numeric(14,2);
  v_interest  numeric(14,2);
  v_penalty   numeric(14,2);
  v_remainder numeric(14,2);
begin
  if member_group_role(p_group_id, p_declared_by) is distinct from 'treasurer' then
    raise exception 'Only the Treasurer can prepare the distribution';
  end if;

  select string_agg(r.label, ' ') into v_blockers from distribution_readiness(p_group_id) r;
  if v_blockers is not null then raise exception '%', v_blockers; end if;

  select * into v_c from cycles where group_id = p_group_id and status = 'active' limit 1;

  delete from distributions where group_id = p_group_id and status in ('draft', 'previewed');

  create temporary table tmp_breakdown on commit drop as
    select * from distribution_breakdown(p_group_id);

  select coalesce(sum(heads), 0), coalesce(sum(capital), 0), coalesce(sum(loan_owed + penalties), 0)
    into v_heads, v_capital, v_ded
  from tmp_breakdown;
  if v_heads = 0 then raise exception 'No members with heads in this group'; end if;

  v_net := group_available_cash(p_group_id) + v_ded - v_capital;
  if v_capital + v_net - v_ded <= 0 then raise exception 'Nothing to distribute'; end if;

  -- For display: what the net income is made of.
  select max(finalized_at) into v_since from distributions where group_id = p_group_id and status = 'finalized';
  select
    coalesce((select sum(lp.interest_portion) from loan_payments lp
              join ledger_entries e on e.id = lp.ledger_entry_id
              where e.group_id = p_group_id and (v_since is null or e.posted_at > v_since)), 0)
    + coalesce((select sum(loan_amount_owed(l) - l.outstanding_balance) from loans l
                where l.group_id = p_group_id and l.status = 'active'), 0)
    into v_interest;
  select
    coalesce((select sum(e.amount) from ledger_entries e
              where e.group_id = p_group_id and e.entry_type = 'penalty' and e.direction = 'credit'
                and (v_since is null or e.posted_at > v_since)), 0)
    + coalesce((select sum(p.amount) from penalties p where p.group_id = p_group_id and p.status = 'pending'), 0)
    into v_penalty;

  insert into distributions (
    group_id, cycle_id, period, total_amount, status, declared_by,
    capital_total, net_income, interest_income, penalty_income, deductions_total, total_heads
  ) values (
    p_group_id, v_c.id, v_c.name, v_capital + v_net - v_ded, 'draft', p_declared_by,
    v_capital, v_net, v_interest, v_penalty, v_ded, v_heads
  ) returning * into v_dist;

  insert into distribution_allocations (
    distribution_id, membership_id, amount, heads, capital, share, loan_deduction, penalty_deduction
  )
  select v_dist.id, b.membership_id, b.payout, b.heads, b.capital, b.share, b.loan_owed, b.penalties
  from tmp_breakdown b;

  -- Rounding: the leftover centavos go to the member with the most heads,
  -- so payouts add up to exactly the cash in the fund.
  select v_net - coalesce(sum(share), 0) into v_remainder
  from distribution_allocations where distribution_id = v_dist.id;
  if v_remainder <> 0 then
    update distribution_allocations set share = share + v_remainder, amount = amount + v_remainder
    where id = (select id from distribution_allocations where distribution_id = v_dist.id
                order by heads desc, capital desc limit 1);
  end if;

  return v_dist;
end;
$$;
revoke execute on function preview_distribution(uuid, uuid) from public, anon, authenticated;
grant execute on function preview_distribution(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- Submit for verification (Treasurer)
-- ---------------------------------------------------------------------

create or replace function submit_distribution(p_distribution_id uuid, p_actor_id uuid)
returns distributions
language plpgsql security definer
set search_path = public
as $$
declare
  v_dist distributions;
begin
  select * into v_dist from distributions where id = p_distribution_id for update;
  if not found then raise exception 'Distribution not found'; end if;
  if member_group_role(v_dist.group_id, p_actor_id) is distinct from 'treasurer' then
    raise exception 'Only the Treasurer can submit the distribution';
  end if;
  if v_dist.status <> 'draft' then raise exception 'Only a draft can be submitted'; end if;
  if abs(group_available_cash(v_dist.group_id) - v_dist.total_amount) > 0.01 then
    raise exception 'The fund changed since you prepared this. Prepare the preview again.';
  end if;

  update distributions set status = 'previewed', submitted_by = p_actor_id, submitted_at = now(), updated_at = now()
  where id = p_distribution_id
  returning * into v_dist;
  return v_dist;
end;
$$;
revoke execute on function submit_distribution(uuid, uuid) from public, anon, authenticated;
grant execute on function submit_distribution(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- Finalize (Organizer) — now also settles the deducted loans and penalties
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

  -- Balances as they are now, taken once before anything is settled.
  create temporary table tmp_final on commit drop as
    select * from distribution_breakdown(v_dist.group_id);

  for v_alloc in
    select * from distribution_allocations where distribution_id = p_distribution_id
  loop
    -- Nothing the preview deducted may have moved since.
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

    -- Capital + share leave the fund; net of the above, cash out = payout.
    if v_alloc.capital + v_alloc.share > 0 then
      insert into ledger_entries (
        group_id, membership_id, cycle_id, entry_type, direction, amount, source_type, source_id, description, posted_by
      ) values (
        v_dist.group_id, v_alloc.membership_id, v_dist.cycle_id,
        'distribution', 'debit', v_alloc.capital + v_alloc.share,
        'distribution', v_dist.id, 'Year-end distribution', p_finalized_by
      ) returning * into v_ledger;

      update distribution_allocations set ledger_entry_id = v_ledger.id where id = v_alloc.id;
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

-- Previews built with the old formula can't be finalized; clear the open ones.
delete from distributions where status in ('draft', 'previewed', 'verified') and capital_total is null;
