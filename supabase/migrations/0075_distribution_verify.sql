-- =====================================================================
-- KapitPondo — 0075 Verify Distribution Figures (UC-YD-02)
--
-- * 'returned': the Auditor sends a preview back with notes. It stays as a
--   record (it used to be deleted) so the Treasurer sees why; preparing
--   again builds a new draft beside it.
-- * distribution_ledger_check(): the preview's figures next to what the
--   ledger says now — totals and any member whose capital, loan or
--   penalties moved (E1).
-- =====================================================================

alter type distribution_status add value if not exists 'returned';

alter table distributions add column if not exists returned_by   uuid references members(id);
alter table distributions add column if not exists returned_at   timestamptz;
alter table distributions add column if not exists return_reason text;

-- Rows: kind = 'total' (always: capital, net_income, deductions, payout) or
-- 'member' (only where that member's figures moved since the preview).
create or replace function distribution_ledger_check(p_distribution_id uuid)
returns table (kind text, item text, label text, membership_id uuid, preview_amount numeric, ledger_amount numeric)
language plpgsql security definer
set search_path = public
as $$
declare
  v_d       distributions;
  v_capital numeric(14,2);
  v_ded     numeric(14,2);
  v_cash    numeric(14,2);
  v_r       record;
begin
  select * into v_d from distributions where id = p_distribution_id;
  if not found then raise exception 'Distribution not found'; end if;
  if v_d.capital_total is null then raise exception 'This preview was made with the old formula'; end if;

  create temporary table tmp_check on commit drop as
    select * from distribution_breakdown(v_d.group_id);

  select coalesce(sum(b.capital), 0), coalesce(sum(b.loan_owed + b.penalties), 0)
    into v_capital, v_ded from tmp_check b;
  v_cash := group_available_cash(v_d.group_id);

  kind := 'total'; membership_id := null;
  item := 'capital';    label := 'Capital';      preview_amount := v_d.capital_total;    ledger_amount := v_capital;                  return next;
  item := 'net_income'; label := 'Net income';   preview_amount := v_d.net_income;       ledger_amount := v_cash + v_ded - v_capital; return next;
  item := 'deductions'; label := 'Deductions';   preview_amount := v_d.deductions_total; ledger_amount := v_ded;                      return next;
  item := 'payout';     label := 'Total payout'; preview_amount := v_d.total_amount;     ledger_amount := v_cash;                     return next;

  kind := 'member';
  for v_r in
    select a.membership_id as mid, coalesce(m.full_name, 'A member') as name,
           a.capital as a_cap, coalesce(b.capital, 0) as b_cap,
           a.loan_deduction + a.penalty_deduction as a_ded, coalesce(b.loan_owed + b.penalties, 0) as b_ded
    from distribution_allocations a
    left join tmp_check b on b.membership_id = a.membership_id
    join memberships ms on ms.id = a.membership_id
    left join members m on m.id = ms.member_id
    where a.distribution_id = p_distribution_id
  loop
    membership_id := v_r.mid;
    if abs(v_r.a_cap - v_r.b_cap) > 0.01 then
      item := 'capital'; label := v_r.name || ' — capital'; preview_amount := v_r.a_cap; ledger_amount := v_r.b_cap; return next;
    end if;
    if abs(v_r.a_ded - v_r.b_ded) > 0.01 then
      item := 'deductions'; label := v_r.name || ' — loans and penalties'; preview_amount := v_r.a_ded; ledger_amount := v_r.b_ded; return next;
    end if;
  end loop;
end;
$$;
revoke execute on function distribution_ledger_check(uuid) from public, anon, authenticated;
grant execute on function distribution_ledger_check(uuid) to service_role;
