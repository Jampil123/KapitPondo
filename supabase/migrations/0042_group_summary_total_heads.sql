-- =====================================================================
-- KapitPondo — Migration 0042
-- Adds total_heads to group_summary() — needed to let a member compute
-- their own live "if the cycle closed today" share (available_cash × own
-- heads ÷ total_heads, matching what preview_distribution actually pays
-- out — see migration 0028's comment on that function). active_members
-- was already there but is a plain membership COUNT, not a heads SUM
-- (same distinction fixed for cycle_progress in migration 0040) — kept
-- as-is since other callers may rely on it, just adding the field that's
-- actually needed here rather than repurposing it.
-- =====================================================================

-- Postgres won't let CREATE OR REPLACE change a function's return shape
-- (adding total_heads counts as that) — drop first, same as migrations
-- 0003 and 0011 did when they last reshaped this table return.
drop function if exists group_summary(uuid);

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
    coalesce(sum(case when l.direction = 'credit' then l.amount else -l.amount end), 0)::numeric(14,2),
    (select count(*) from memberships m where m.group_id = p_group_id and m.status = 'active'),
    (select coalesce(sum(m.heads), 0) from memberships m where m.group_id = p_group_id and m.status = 'active'),
    (select count(*) from loans ln where ln.group_id = p_group_id and ln.status = 'pending')
  from ledger_entries l
  where l.group_id = p_group_id;
end;
$$;

-- =====================================================================
-- End of 0042_group_summary_total_heads.sql
-- =====================================================================
