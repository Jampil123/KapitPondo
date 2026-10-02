-- =====================================================================
-- KapitPondo — 0061 Fix withdrawal_settlement() blockers
-- 0060 added each blocker with `v_blockers || '...'`, which Postgres reads as
-- array || array and fails (22P02 malformed array literal) whenever there is
-- a blocker. array_append adds the text as one element.
-- =====================================================================

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
    v_blockers := array_append(v_blockers, 'Not an active member of this group.'::text);
  end if;
  if v_m.role <> 'member' then
    v_blockers := array_append(v_blockers, 'Officers can''t withdraw. Change their role to Member first.'::text);
  end if;
  if exists (select 1 from withdrawals w where w.membership_id = p_membership_id and w.status in ('pending_release', 'released')) then
    v_blockers := array_append(v_blockers, 'A withdrawal is already in progress.'::text);
  end if;
  if exists (select 1 from distributions d where d.group_id = v_m.group_id and d.status in ('previewed', 'verified')) then
    v_blockers := array_append(v_blockers, 'A year-end share is in progress. Finish it first.'::text);
  end if;
  if exists (select 1 from loans l where l.membership_id = p_membership_id and l.status in ('pending', 'approved')) then
    v_blockers := array_append(v_blockers, 'A loan request is still being processed.'::text);
  end if;
  if exists (select 1 from loans l where l.membership_id = p_membership_id and l.status = 'active' and l.disbursed_ledger_entry_id is null) then
    v_blockers := array_append(v_blockers, 'A loan release is still waiting for verification.'::text);
  end if;
  if exists (select 1 from contributions c where c.membership_id = p_membership_id and c.status in ('submitted', 'confirmed')) then
    v_blockers := array_append(v_blockers, 'A contribution is still waiting for sign-off.'::text);
  end if;
  if exists (select 1 from loan_payments p join loans l on l.id = p.loan_id
             where l.membership_id = p_membership_id and p.status in ('submitted', 'confirmed')) then
    v_blockers := array_append(v_blockers, 'A loan repayment is still waiting for sign-off.'::text);
  end if;
  if payout < 0 then
    v_blockers := array_append(v_blockers, 'Their loan and penalties are more than their contributions. They need to pay the difference first.'::text);
  end if;

  blockers := v_blockers;
  return next;
end;
$$;

revoke execute on function withdrawal_settlement(uuid) from public, anon, authenticated;
grant execute on function withdrawal_settlement(uuid) to service_role;
