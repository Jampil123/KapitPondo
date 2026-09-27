-- =====================================================================
-- KapitPondo — 0015 Security: RLS, policies & function grants
--
-- The mobile app holds the anon key and a signed-in session. The API uses
-- the service_role key, which bypasses RLS, so every legitimate write goes
-- through the API's role and segregation checks. The app only reads (for
-- realtime refresh), so most tables get a read policy and no write policy.
-- Chat tables and members also allow the caller's own inserts.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------
alter table members enable row level security;

create policy "members: read own"
  on members for select to authenticated
  using (auth_id = auth.uid());

create policy "members: insert own"
  on members for insert to authenticated
  with check (auth_id = auth.uid());

create policy "members: update own"
  on members for update to authenticated
  using (auth_id = auth.uid());

alter table identity_submissions enable row level security;

create policy "identity_submissions: read own"
  on identity_submissions for select to authenticated
  using (member_id = public.current_member_id());

alter table platform_admins enable row level security;

create policy "sysadmin reads admins"
  on platform_admins for select
  using (public.is_sysadmin());

alter table system_audit_log enable row level security;

create policy "sysadmin reads audit"
  on system_audit_log for select
  using (public.is_sysadmin());

-- Not read by the app at all: RLS on, no policy.
alter table admin_security_questions enable row level security;

alter table push_tokens enable row level security;

create policy "push_tokens: read own"
  on push_tokens for select to authenticated
  using (member_id = public.current_member_id());

alter table login_activity enable row level security;

create policy "login_activity: read own"
  on login_activity for select to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

alter table feedback enable row level security;

create policy "feedback: read own"
  on feedback for select to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

alter table profile_update_requests enable row level security;

create policy "profile_update_requests: read own"
  on profile_update_requests for select to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Groups & membership
-- ---------------------------------------------------------------------
alter table groups enable row level security;

create policy "groups: read as member"
  on groups for select to authenticated
  using (
    id in (
      select group_id
      from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
    )
  );

alter table memberships enable row level security;

create policy "memberships: read own"
  on memberships for select to authenticated
  using (
    member_id = (select id from members where auth_id = auth.uid())
  );

alter table membership_head_names enable row level security;

create policy "membership_head_names: read within group"
  on membership_head_names for select to authenticated
  using (exists (
    select 1
    from memberships target
    join memberships mine on mine.group_id = target.group_id
    join members me on me.id = mine.member_id
    where target.id = membership_head_names.membership_id
      and me.auth_id = auth.uid()
  ));

-- Not read by the app at all: RLS on, no policy.
alter table accounts enable row level security;

-- ---------------------------------------------------------------------
-- Money tables: readable by active members of the group
-- ---------------------------------------------------------------------
alter table cycles enable row level security;
create policy "cycles: read as active member"
  on cycles for select to authenticated
  using (public.has_group_role(group_id));

alter table ledger_entries enable row level security;
create policy "ledger_entries: read as active member"
  on ledger_entries for select to authenticated
  using (public.has_group_role(group_id));

alter table contributions enable row level security;
create policy "contributions: read as active member"
  on contributions for select to authenticated
  using (public.has_group_role(group_id));

alter table penalties enable row level security;
create policy "penalties: read as active member"
  on penalties for select to authenticated
  using (public.has_group_role(group_id));

alter table ledger_reversal_requests enable row level security;
create policy "ledger_reversal_requests: read as active member"
  on ledger_reversal_requests for select to authenticated
  using (public.has_group_role(group_id));

alter table loans enable row level security;
create policy "loans: read as active member"
  on loans for select to authenticated
  using (public.has_group_role(group_id));

alter table loan_payments enable row level security;
create policy "loan_payments: read as active member"
  on loan_payments for select to authenticated
  using (exists (select 1 from loans l where l.id = loan_payments.loan_id and public.has_group_role(l.group_id)));

alter table distributions enable row level security;
create policy "distributions: read as active member"
  on distributions for select to authenticated
  using (public.has_group_role(group_id));

alter table distribution_allocations enable row level security;
create policy "distribution_allocations: read as active member"
  on distribution_allocations for select to authenticated
  using (exists (
    select 1 from distributions d
    where d.id = distribution_allocations.distribution_id and public.has_group_role(d.group_id)
  ));

-- ---------------------------------------------------------------------
-- Oversight: Auditor and Organizer only
-- ---------------------------------------------------------------------
alter table audit_log enable row level security;
create policy "audit_log: read as auditor or owner"
  on audit_log for select to authenticated
  using (public.has_group_role(group_id, array['auditor', 'owner']));

-- Append-only for clients too (the triggers in 0007 also block service_role).
revoke update, delete, truncate on audit_log from anon, authenticated;

alter table audit_flags enable row level security;
create policy "audit_flags: read as auditor or owner"
  on audit_flags for select to authenticated
  using (public.has_group_role(group_id, array['auditor', 'owner']));

alter table audit_findings enable row level security;
create policy "audit_findings: read as auditor or owner"
  on audit_findings for select to authenticated
  using (public.has_group_role(group_id, array['auditor', 'owner']));

-- ---------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------
alter table notifications enable row level security;

create policy "notifications: read own"
  on notifications for select to authenticated
  using (member_id = (select id from members where auth_id = auth.uid()));

alter table messages enable row level security;

create policy "messages: read general as active member"
  on messages for select to authenticated
  using (
    channel = 'general'
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
    )
  );

create policy "messages: read officers as officer"
  on messages for select to authenticated
  using (
    channel = 'officers'
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
        and role in ('owner', 'treasurer', 'auditor')
    )
  );

create policy "messages: insert general as active member"
  on messages for insert to authenticated
  with check (
    channel = 'general'
    and sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
    )
  );

create policy "messages: insert officers as officer"
  on messages for insert to authenticated
  with check (
    channel = 'officers'
    and sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
        and role in ('owner', 'treasurer', 'auditor')
    )
  );

alter table direct_messages enable row level security;

create policy "direct_messages: read own conversations"
  on direct_messages for select to authenticated
  using (
    (select id from members where auth_id = auth.uid()) in (sender_id, recipient_id)
  );

create policy "direct_messages: insert as self"
  on direct_messages for insert to authenticated
  with check (
    sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = sender_id and status = 'active'
    )
  );

alter table announcements enable row level security;

create policy "announcements: read as active member"
  on announcements for select to authenticated
  using (
    group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
    )
  );

create policy "announcements: insert as owner"
  on announcements for insert to authenticated
  with check (
    sender_id = (select id from members where auth_id = auth.uid())
    and group_id in (
      select group_id from memberships
      where member_id = (select id from members where auth_id = auth.uid())
        and status = 'active'
        and role = 'owner'
    )
  );

-- ---------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------

-- Helpers used inside RLS policies.
revoke all on function public.is_sysadmin() from public;
grant execute on function public.is_sysadmin() to authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.has_group_role(uuid, text[]) to authenticated;

-- Money functions: API (service_role) only. Functions get EXECUTE for
-- PUBLIC by default, and these take the actor's id as a parameter, so a
-- direct rpc() call could act as anyone. Every overload of each name.
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
        -- groups & membership
        'approve_member', 'reject_member', 'close_cycle',
        -- money in
        'confirm_contribution', 'verify_contribution', 'approve_contribution',
        'record_walk_in_contribution', 'record_walkin_contribution', 'post_walk_in_contribution',
        'settle_contribution_penalties',
        -- loans & repayments
        'approve_loan', 'review_loan', 'disburse_loan', 'verify_loan_release',
        'submit_loan_repayment', 'record_loan_repayment', 'confirm_repayment',
        'record_walk_in_repayment', 'verify_repayment', 'confirm_loan_repayment',
        -- ledger & distributions
        'post_adjustment', 'reverse_ledger_entry', 'preview_distribution', 'finalize_distribution'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
