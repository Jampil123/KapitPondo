-- =====================================================================
-- KapitPondo — 0060 Suspend, reactivate and withdraw a member (UC-GM-04)
--
-- Suspend / reactivate: the Organizer flips memberships.status between
-- 'active' and 'suspended'. A suspended member keeps their money in the
-- fund and can still view it (the API allows their read requests only).
--
-- Withdraw: the member leaves with their contributions settled.
--   Settlement = contributions posted since the last year-end share
--              − loan still owed (principal left + interest not yet paid)
--              − unpaid penalties
--   Earnings (interest, penalties) stay in the fund for year-end.
--
-- Two-step, like a loan release:
--   pending_release ──release (Treasurer)──▶ released ──verify (Auditor)──▶ verified
--   The Organizer starts it (and can cancel before the cash is released).
--   Verifying posts everything: the payout, and paying off the loan and
--   penalties out of the member's contributions. The membership becomes
--   'exited'.
-- =====================================================================

-- Why a membership is suspended / exited, shown to officers and the member.
alter table memberships add column if not exists status_reason     text;
alter table memberships add column if not exists status_changed_at timestamptz;
alter table memberships add column if not exists status_changed_by uuid references members(id);

create table withdrawals (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  membership_id     uuid not null references memberships(id) on delete cascade,
  status            text not null default 'pending_release'
                    check (status in ('pending_release', 'released', 'verified', 'cancelled')),
  -- The settlement, frozen when the withdrawal starts; re-checked on verify.
  capital           numeric(14,2) not null default 0,
  loan_owed         numeric(14,2) not null default 0,
  penalties         numeric(14,2) not null default 0,
  payout            numeric(14,2) not null default 0 check (payout >= 0),
  -- The membership status (and its reason) to go back to if cancelled.
  previous_status   membership_status not null,
  previous_status_reason text,
  note              text,
  initiated_by      uuid not null references members(id),
  initiated_at      timestamptz not null default now(),
  released_by       uuid references members(id),
  released_at       timestamptz,
  verified_by       uuid references members(id),
  verified_at       timestamptz,
  cancelled_by      uuid references members(id),
  cancelled_at      timestamptz,
  cancel_reason     text,
  payout_ledger_entry_id uuid references ledger_entries(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_withdrawals_group      on withdrawals (group_id);
create index idx_withdrawals_membership on withdrawals (membership_id);
-- One withdrawal in flight per membership.
create unique index uq_withdrawals_open on withdrawals (membership_id)
  where status in ('pending_release', 'released');

create trigger trg_withdrawals_updated before update on withdrawals
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Settlement
-- ---------------------------------------------------------------------

-- Loan still owed on one loan: principal left + flat-rate interest not yet
-- posted — the same figure the borrower sees as "left to repay".
create or replace function loan_amount_owed(p_loan loans)
returns numeric(14,2)
language sql stable security definer
set search_path = public
as $$
  select (
    p_loan.outstanding_balance
    + greatest(
        case when coalesce(p_loan.interest_rate, 0) > 0 and coalesce(p_loan.term_months, 0) > 0
             then round(coalesce(p_loan.approved_principal, p_loan.principal) * p_loan.interest_rate * p_loan.term_months, 2)
             else 0 end
        - coalesce((select sum(p.interest_portion) from loan_payments p
                    where p.loan_id = p_loan.id and p.status in ('paid', 'approved')), 0),
        0)
  )::numeric(14,2)
$$;

-- What a member would be paid on withdrawing now, and anything that stops it.
create or replace function withdrawal_settlement(p_membership_id uuid)
returns table (capital numeric, loan_owed numeric, penalties numeric, payout numeric, blockers text[])
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_m        memberships;
  v_since    timestamptz;
  v_blockers text[] := '{}';
begin
  select * into v_m from memberships where id = p_membership_id;
  if not found then raise exception 'Membership not found'; end if;

  -- Year-end shares pay out all cash, capital included, so only
  -- contributions posted since the last one are still the member's.
  select max(finalized_at) into v_since
  from distributions where group_id = v_m.group_id and status = 'finalized';

  select coalesce(sum(case when e.entry_type = 'contribution' then e.amount else -e.amount end), 0)
    into capital
  from ledger_entries e
  where e.membership_id = p_membership_id
    and (v_since is null or e.posted_at > v_since)
    and (
      (e.entry_type = 'contribution' and e.direction = 'credit')
      -- a reversed contribution no longer counts
      or (e.entry_type = 'reversal' and e.reverses_entry_id in (
            select c.id from ledger_entries c where c.membership_id = p_membership_id and c.entry_type = 'contribution'))
    );
  capital := greatest(capital, 0);

  select coalesce(sum(loan_amount_owed(l)), 0) into loan_owed
  from loans l where l.membership_id = p_membership_id and l.status = 'active';

  select coalesce(sum(p.amount), 0) into penalties
  from penalties p where p.membership_id = p_membership_id and p.status = 'pending';

  payout := capital - loan_owed - penalties;

  if v_m.status not in ('active', 'suspended') then
    v_blockers := v_blockers || 'Not an active member of this group.';
  end if;
  if v_m.role <> 'member' then
    v_blockers := v_blockers || 'Officers can''t withdraw. Change their role to Member first.';
  end if;
  if exists (select 1 from withdrawals w where w.membership_id = p_membership_id and w.status in ('pending_release', 'released')) then
    v_blockers := v_blockers || 'A withdrawal is already in progress.';
  end if;
  if exists (select 1 from distributions d where d.group_id = v_m.group_id and d.status in ('previewed', 'verified')) then
    v_blockers := v_blockers || 'A year-end share is in progress. Finish it first.';
  end if;
  if exists (select 1 from loans l where l.membership_id = p_membership_id and l.status in ('pending', 'approved')) then
    v_blockers := v_blockers || 'A loan request is still being processed.';
  end if;
  if exists (select 1 from loans l where l.membership_id = p_membership_id and l.status = 'active' and l.disbursed_ledger_entry_id is null) then
    v_blockers := v_blockers || 'A loan release is still waiting for verification.';
  end if;
  if exists (select 1 from contributions c where c.membership_id = p_membership_id and c.status in ('submitted', 'confirmed')) then
    v_blockers := v_blockers || 'A contribution is still waiting for sign-off.';
  end if;
  if exists (select 1 from loan_payments p join loans l on l.id = p.loan_id
             where l.membership_id = p_membership_id and p.status in ('submitted', 'confirmed')) then
    v_blockers := v_blockers || 'A loan repayment is still waiting for sign-off.';
  end if;
  if payout < 0 then
    v_blockers := v_blockers || 'Their loan and penalties are more than their contributions. They need to pay the difference first.';
  end if;

  blockers := v_blockers;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- Suspend / reactivate (Organizer)
-- ---------------------------------------------------------------------

create or replace function suspend_membership(p_membership_id uuid, p_actor_id uuid, p_reason text)
returns memberships
language plpgsql security definer
set search_path = public
as $$
declare
  v_m memberships;
begin
  select * into v_m from memberships where id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;
  if member_group_role(v_m.group_id, p_actor_id) is distinct from 'owner' then
    raise exception 'Only the Organizer can suspend a member';
  end if;
  if v_m.member_id = p_actor_id then raise exception 'You cannot suspend yourself'; end if;
  if v_m.status <> 'active' then raise exception 'Only an active member can be suspended'; end if;
  if v_m.role <> 'member' then
    raise exception 'Officers can''t be suspended. Change their role to Member first.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for the suspension'; end if;

  update memberships set
    status = 'suspended', status_reason = trim(p_reason),
    status_changed_at = now(), status_changed_by = p_actor_id, updated_at = now()
  where id = p_membership_id
  returning * into v_m;
  return v_m;
end;
$$;

create or replace function reactivate_membership(p_membership_id uuid, p_actor_id uuid)
returns memberships
language plpgsql security definer
set search_path = public
as $$
declare
  v_m memberships;
begin
  select * into v_m from memberships where id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;
  if member_group_role(v_m.group_id, p_actor_id) is distinct from 'owner' then
    raise exception 'Only the Organizer can reactivate a member';
  end if;
  if v_m.status <> 'suspended' then raise exception 'This member is not suspended'; end if;
  if exists (select 1 from withdrawals w where w.membership_id = p_membership_id and w.status in ('pending_release', 'released')) then
    raise exception 'This member is withdrawing. Cancel the withdrawal instead.';
  end if;

  update memberships set
    status = 'active', status_reason = null,
    status_changed_at = now(), status_changed_by = p_actor_id, updated_at = now()
  where id = p_membership_id
  returning * into v_m;
  return v_m;
end;
$$;

-- ---------------------------------------------------------------------
-- Withdraw: start (Organizer) → release (Treasurer) → verify (Auditor)
-- ---------------------------------------------------------------------

create or replace function start_withdrawal(p_membership_id uuid, p_actor_id uuid, p_note text default null)
returns withdrawals
language plpgsql security definer
set search_path = public
as $$
declare
  v_m memberships;
  v_s record;
  v_w withdrawals;
begin
  select * into v_m from memberships where id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;
  if member_group_role(v_m.group_id, p_actor_id) is distinct from 'owner' then
    raise exception 'Only the Organizer can withdraw a member';
  end if;
  if v_m.member_id = p_actor_id then raise exception 'You cannot withdraw yourself'; end if;

  select * into v_s from withdrawal_settlement(p_membership_id);
  if array_length(v_s.blockers, 1) > 0 then
    raise exception '%', array_to_string(v_s.blockers, ' ');
  end if;

  insert into withdrawals (group_id, membership_id, capital, loan_owed, penalties, payout, previous_status, previous_status_reason, note, initiated_by)
  values (v_m.group_id, p_membership_id, v_s.capital, v_s.loan_owed, v_s.penalties, v_s.payout, v_m.status, v_m.status_reason, nullif(trim(p_note), ''), p_actor_id)
  returning * into v_w;

  -- No new money in or out while the settlement is open.
  update memberships set
    status = 'suspended', status_reason = 'Withdrawal in progress',
    status_changed_at = now(), status_changed_by = p_actor_id, updated_at = now()
  where id = p_membership_id;

  return v_w;
end;
$$;

create or replace function cancel_withdrawal(p_withdrawal_id uuid, p_actor_id uuid, p_reason text)
returns withdrawals
language plpgsql security definer
set search_path = public
as $$
declare
  v_w withdrawals;
begin
  select * into v_w from withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if member_group_role(v_w.group_id, p_actor_id) is distinct from 'owner' then
    raise exception 'Only the Organizer can cancel a withdrawal';
  end if;
  if v_w.status <> 'pending_release' then
    raise exception 'The cash has already been released, so this withdrawal can''t be cancelled';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for cancelling'; end if;

  update withdrawals set
    status = 'cancelled', cancelled_by = p_actor_id, cancelled_at = now(), cancel_reason = trim(p_reason)
  where id = p_withdrawal_id
  returning * into v_w;

  update memberships set
    status = v_w.previous_status,
    status_reason = v_w.previous_status_reason,
    status_changed_at = now(), status_changed_by = p_actor_id, updated_at = now()
  where id = v_w.membership_id;

  return v_w;
end;
$$;

-- The Treasurer hands over the payout (cash out). Posts nothing yet.
create or replace function release_withdrawal(p_withdrawal_id uuid, p_actor_id uuid)
returns withdrawals
language plpgsql security definer
set search_path = public
as $$
declare
  v_w      withdrawals;
  v_member uuid;
begin
  select * into v_w from withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if v_w.status <> 'pending_release' then raise exception 'This withdrawal is not waiting for release'; end if;

  select member_id into v_member from memberships where id = v_w.membership_id;
  if p_actor_id = v_member then raise exception 'You cannot release your own withdrawal'; end if;
  if p_actor_id = v_w.initiated_by then raise exception 'The person who started a withdrawal cannot also release it'; end if;
  if member_group_role(v_w.group_id, p_actor_id) is distinct from 'treasurer' then
    raise exception 'This withdrawal must be released by the Treasurer';
  end if;

  update withdrawals set status = 'released', released_by = p_actor_id, released_at = now()
  where id = p_withdrawal_id
  returning * into v_w;
  return v_w;
end;
$$;

-- The Auditor checks the payout and posts it: loan and penalties paid off
-- out of the member's contributions, the rest paid out, membership exited.
create or replace function verify_withdrawal(p_withdrawal_id uuid, p_actor_id uuid)
returns withdrawals
language plpgsql security definer
set search_path = public
as $$
declare
  v_w        withdrawals;
  v_member   uuid;
  v_s        record;
  v_loan     loans;
  v_owed     numeric(14,2);
  v_interest numeric(14,2);
  v_payment  loan_payments;
  v_pen      penalties;
  v_ledger   ledger_entries;
begin
  select * into v_w from withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if v_w.status <> 'released' then raise exception 'This withdrawal is not waiting for verification'; end if;

  select member_id into v_member from memberships where id = v_w.membership_id for update;
  if p_actor_id = v_member then raise exception 'You cannot verify your own withdrawal'; end if;
  if p_actor_id in (v_w.initiated_by, v_w.released_by) then
    raise exception 'The person who started or released a withdrawal cannot also verify it';
  end if;
  if member_group_role(v_w.group_id, p_actor_id) is distinct from 'auditor' then
    raise exception 'This withdrawal must be verified by the Auditor';
  end if;

  -- The member was suspended while this was open, but check nothing moved.
  select * into v_s from withdrawal_settlement(v_w.membership_id);
  if abs(v_s.capital - v_w.capital) > 0.01 or abs(v_s.loan_owed - v_w.loan_owed) > 0.01 or abs(v_s.penalties - v_w.penalties) > 0.01 then
    raise exception 'The member''s balances changed since the withdrawal started. Ask the Organizer to cancel it and start again.';
  end if;

  -- Pay off each active loan out of the member's contributions.
  for v_loan in select * from loans where membership_id = v_w.membership_id and status = 'active' for update loop
    v_owed := loan_amount_owed(v_loan);
    continue when v_owed <= 0;
    v_interest := v_owed - v_loan.outstanding_balance;

    insert into loan_payments (
      loan_id, amount, principal_portion, interest_portion, status, payment_method, external_reference,
      recorded_by, confirmed_by, confirmed_at, approved_by, paid_date
    ) values (
      v_loan.id, v_owed, v_loan.outstanding_balance, v_interest, 'paid', 'other', 'Withdrawal settlement',
      v_w.initiated_by, v_w.released_by, v_w.released_at, p_actor_id, current_date
    ) returning * into v_payment;

    insert into ledger_entries (group_id, membership_id, entry_type, direction, amount, source_type, source_id, description, posted_by)
    values (v_w.group_id, v_w.membership_id, 'loan_repayment', 'credit', v_owed, 'loan_payment', v_payment.id, 'Paid from withdrawal settlement', p_actor_id)
    returning * into v_ledger;

    update loan_payments set ledger_entry_id = v_ledger.id where id = v_payment.id;
    update loans set outstanding_balance = 0, status = 'paid', updated_at = now() where id = v_loan.id;
  end loop;

  -- Unpaid penalties, the same way.
  for v_pen in select * from penalties where membership_id = v_w.membership_id and status = 'pending' and amount > 0 for update loop
    insert into ledger_entries (group_id, membership_id, cycle_id, entry_type, direction, amount, source_type, source_id, description, posted_by)
    values (v_pen.group_id, v_pen.membership_id, v_pen.cycle_id, 'penalty', 'credit', v_pen.amount, 'penalty', v_pen.id, 'Paid from withdrawal settlement', p_actor_id)
    returning * into v_ledger;
    update penalties set status = 'paid', ledger_entry_id = v_ledger.id, updated_at = now() where id = v_pen.id;
  end loop;

  -- The member's contributions leave the fund; net of the above, the cash
  -- out equals the payout the Treasurer released.
  if v_w.capital > 0 then
    insert into ledger_entries (group_id, membership_id, entry_type, direction, amount, source_type, source_id, description, posted_by)
    values (v_w.group_id, v_w.membership_id, 'withdrawal', 'debit', v_w.capital, 'withdrawal', v_w.id, 'Withdrawal settlement', p_actor_id)
    returning * into v_ledger;
  else
    v_ledger := null;
  end if;

  update withdrawals set
    status = 'verified', verified_by = p_actor_id, verified_at = now(), payout_ledger_entry_id = v_ledger.id
  where id = p_withdrawal_id
  returning * into v_w;

  update memberships set
    status = 'exited', status_reason = 'Withdrew',
    status_changed_at = now(), status_changed_by = p_actor_id, updated_at = now()
  where id = v_w.membership_id;

  return v_w;
end;
$$;

-- ---------------------------------------------------------------------
-- Year-end shares include suspended members: they still own their capital.
-- (Replaces 0013's version, which only counted 'active'.)
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
  if exists (select 1 from withdrawals where group_id = p_group_id and status in ('pending_release', 'released')) then
    raise exception 'A member withdrawal is in progress. Finish or cancel it first.';
  end if;

  select group_available_cash(p_group_id) into v_available;
  if v_available <= 0 then
    raise exception 'Nothing to distribute: available cash is %', v_available;
  end if;

  select coalesce(sum(heads), 0) into v_total_heads
  from memberships
  where group_id = p_group_id and status in ('active', 'suspended');

  if v_total_heads = 0 then
    raise exception 'No active members with heads assigned in this group';
  end if;

  insert into distributions (group_id, period, total_amount, status, declared_by)
  values (p_group_id, p_period, v_available, 'previewed', p_declared_by)
  returning * into v_dist;

  for v_mship in
    select * from memberships where group_id = p_group_id and status in ('active', 'suspended')
  loop
    v_share := round((v_available * v_mship.heads::numeric / v_total_heads), 2);
    insert into distribution_allocations (distribution_id, membership_id, amount)
    values (v_dist.id, v_mship.id, v_share);
  end loop;

  return v_dist;
end;
$$;

-- ---------------------------------------------------------------------
-- Security & realtime
-- ---------------------------------------------------------------------
alter table withdrawals enable row level security;
create policy "withdrawals: officers read group, members read own"
  on withdrawals for select to authenticated
  using (
    public.has_group_role(group_id, array['owner', 'treasurer', 'auditor'])
    or public.owns_membership(membership_id)
  );

-- These take the actor's id as a parameter: API (service_role) only.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'suspend_membership', 'reactivate_membership', 'start_withdrawal', 'cancel_withdrawal',
        'release_withdrawal', 'verify_withdrawal', 'preview_distribution', 'withdrawal_settlement', 'loan_amount_owed'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

alter publication supabase_realtime add table withdrawals;
