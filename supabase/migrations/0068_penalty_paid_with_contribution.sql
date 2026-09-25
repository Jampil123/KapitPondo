-- =====================================================================
-- KapitPondo — Migration 0068
-- A late member now pays the contribution and its pending late penalty in
-- one transfer. The submitted contribution keeps the two apart —
-- `amount` is the contribution alone (capital), `penalty_applied` is the
-- penalty share — and each penalty it covers points back at it through
-- `paid_with_contribution_id`.
--
-- settle_contribution_penalties() runs right after approve_contribution():
-- each covered penalty posts its own 'penalty' ledger credit (income, not
-- capital) and becomes 'paid'. A rejected contribution settles nothing; its
-- penalties stay pending and the next submission can cover them again.
-- =====================================================================

alter table penalties
  add column if not exists paid_with_contribution_id uuid references contributions(id) on delete set null;

create index if not exists idx_penalties_paid_with on penalties (paid_with_contribution_id);

create or replace function settle_contribution_penalties(
  p_contribution_id uuid,
  p_approver_id     uuid
)
returns setof penalties
language plpgsql
security definer
as $$
declare
  v_contrib contributions;
  v_penalty penalties;
  v_ledger  ledger_entries;
begin
  select * into v_contrib from contributions where id = p_contribution_id;
  if not found then raise exception 'Contribution not found'; end if;
  if v_contrib.status <> 'approved' then
    raise exception 'Contribution is not approved';
  end if;

  for v_penalty in
    select * from penalties
    where paid_with_contribution_id = p_contribution_id and status = 'pending' and amount > 0
    for update
  loop
    insert into ledger_entries (
      group_id, membership_id, cycle_id,
      entry_type, direction, amount,
      source_type, source_id, description, posted_by
    ) values (
      v_penalty.group_id, v_penalty.membership_id, v_penalty.cycle_id,
      'penalty', 'credit', v_penalty.amount,
      'penalty', v_penalty.id, v_penalty.reason, p_approver_id
    ) returning * into v_ledger;

    update penalties set
      status          = 'paid',
      ledger_entry_id = v_ledger.id,
      updated_at      = now()
    where id = v_penalty.id
    returning * into v_penalty;

    return next v_penalty;
  end loop;
end;
$$;

-- API (service_role) only, same as the other money functions (migration 0066).
revoke execute on function settle_contribution_penalties(uuid, uuid) from public, anon, authenticated;
grant execute on function settle_contribution_penalties(uuid, uuid) to service_role;

-- =====================================================================
-- End of 0068_penalty_paid_with_contribution.sql
-- =====================================================================
