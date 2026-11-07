-- =====================================================================
-- KapitPondo — 0076 Live distribution estimate
--
-- What the year-end split would be right now, shown on the Year-End screen
-- before the Treasurer prepares a preview. Nothing is saved. Per-member rows
-- come from distribution_breakdown() (0074).
-- =====================================================================

create or replace function distribution_estimate(p_group_id uuid)
returns table (
  capital_total numeric, net_income numeric, interest_income numeric, penalty_income numeric,
  deductions_total numeric, total_heads integer, total_amount numeric
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  select coalesce(sum(b.capital), 0), coalesce(sum(b.loan_owed + b.penalties), 0), coalesce(sum(b.heads), 0)
    into capital_total, deductions_total, total_heads
  from distribution_breakdown(p_group_id) b;

  total_amount := group_available_cash(p_group_id);
  net_income := total_amount + deductions_total - capital_total;

  select max(finalized_at) into v_since from distributions where group_id = p_group_id and status = 'finalized';
  select
    coalesce((select sum(lp.interest_portion) from loan_payments lp
              join ledger_entries e on e.id = lp.ledger_entry_id
              where e.group_id = p_group_id and (v_since is null or e.posted_at > v_since)), 0)
    + coalesce((select sum(loan_amount_owed(l) - l.outstanding_balance) from loans l
                where l.group_id = p_group_id and l.status = 'active'), 0)
    into interest_income;
  select
    coalesce((select sum(e.amount) from ledger_entries e
              where e.group_id = p_group_id and e.entry_type = 'penalty' and e.direction = 'credit'
                and (v_since is null or e.posted_at > v_since)), 0)
    + coalesce((select sum(p.amount) from penalties p where p.group_id = p_group_id and p.status = 'pending'), 0)
    into penalty_income;

  return next;
end;
$$;
revoke execute on function distribution_estimate(uuid) from public, anon, authenticated;
grant execute on function distribution_estimate(uuid) to service_role;
