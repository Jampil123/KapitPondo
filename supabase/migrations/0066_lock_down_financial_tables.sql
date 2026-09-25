-- =====================================================================
-- KapitPondo — Migration 0066
-- The mobile app holds the anon key and a logged-in session, and 0002
-- granted select/insert/update/delete on every table to anon/authenticated.
-- RLS was only ever turned on for members/memberships/groups and the chat/
-- notification tables, so any signed-in user could edit or delete
-- contributions, loan payments, reversal requests or the audit log directly
-- through PostgREST, and could call the security-definer money functions
-- (approve_contribution, confirm_loan_repayment, …) with any approver id.
--
-- The API uses the service_role key, which bypasses RLS and keeps its
-- grants, so every legitimate write still goes through the API's role and
-- segregation checks. The app only reads these tables for realtime refresh
-- (useQuery's postgres_changes), which RLS filters — so each table gets a
-- read policy and no write policy.
-- =====================================================================

-- ── helpers (security definer so policies don't recurse into memberships' own RLS) ──
create or replace function public.current_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from members where auth_id = auth.uid()
$$;

create or replace function public.has_group_role(p_group_id uuid, p_roles text[] default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where group_id = p_group_id
      and member_id = public.current_member_id()
      and status = 'active'
      and (p_roles is null or role::text = any (p_roles))
  )
$$;

grant execute on function public.current_member_id() to authenticated;
grant execute on function public.has_group_role(uuid, text[]) to authenticated;

-- ── read-only RLS ────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'contributions', 'cycles', 'distributions', 'expenses', 'ledger_entries',
    'ledger_reversal_requests', 'loans', 'penalties'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: read as active member" on %I', t, t);
    execute format(
      'create policy "%s: read as active member" on %I for select to authenticated using (public.has_group_role(group_id))',
      t, t
    );
  end loop;
end $$;

alter table loan_payments enable row level security;
drop policy if exists "loan_payments: read as active member" on loan_payments;
create policy "loan_payments: read as active member"
  on loan_payments for select to authenticated
  using (exists (select 1 from loans l where l.id = loan_payments.loan_id and public.has_group_role(l.group_id)));

alter table distribution_allocations enable row level security;
drop policy if exists "distribution_allocations: read as active member" on distribution_allocations;
create policy "distribution_allocations: read as active member"
  on distribution_allocations for select to authenticated
  using (exists (select 1 from distributions d where d.id = distribution_allocations.distribution_id and public.has_group_role(d.group_id)));

-- Oversight data: same audience as GET /audit-log.
alter table audit_log enable row level security;
drop policy if exists "audit_log: read as auditor or owner" on audit_log;
create policy "audit_log: read as auditor or owner"
  on audit_log for select to authenticated
  using (public.has_group_role(group_id, array['auditor', 'owner']));

alter table push_tokens enable row level security;
drop policy if exists "push_tokens: read own" on push_tokens;
create policy "push_tokens: read own"
  on push_tokens for select to authenticated
  using (member_id = public.current_member_id());

-- Not read by the app at all: RLS on, no policy.
alter table accounts enable row level security;

-- ── audit log is append-only, for every role including service_role ──
create or replace function prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The audit log is append-only';
end;
$$;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update on audit_log
  for each row execute function prevent_audit_log_mutation();
drop trigger if exists audit_log_no_delete on audit_log;
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function prevent_audit_log_mutation();

revoke update, delete, truncate on audit_log from anon, authenticated;

-- ── money functions: API (service_role) only ─────────────────────────
-- Functions get EXECUTE for PUBLIC by default; these take the actor's id as
-- a parameter, so a direct rpc() call could act as anyone. Every overload
-- of each name is covered.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'approve_and_disburse_loan', 'approve_contribution', 'approve_expense', 'approve_loan',
        'approve_member', 'auto_confirm_contribution', 'auto_confirm_loan_repayment', 'close_cycle',
        'confirm_loan_repayment', 'disburse_loan', 'finalize_distribution', 'post_adjustment',
        'post_walk_in_contribution', 'preview_distribution', 'record_loan_repayment',
        'record_walkin_contribution', 'reject_member', 'reverse_ledger_entry', 'submit_loan_repayment'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- =====================================================================
-- End of 0066_lock_down_financial_tables.sql
-- =====================================================================
