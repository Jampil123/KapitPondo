-- =====================================================================
-- KapitPondo — Migration 0056
-- Reports of Problems / Complaints.
--
-- Members raise problems (wrong account details, verification trouble,
-- technical faults, inappropriate group activity, account concerns); the
-- System Administrator works each one through
--   new → under review → investigating → resolved → closed.
--
-- Deliberate boundary: a complaint about money is REFERRED to the fund
-- group's officers (resolution = 'referred_to_group'). The System
-- Administrator never edits contributions, loans, or the ledger — financial
-- corrections stay inside the group's own authorized workflow (the reversal
-- flow in ledger.routes.js, with its three officers).
-- =====================================================================

create table if not exists problem_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references members(id) on delete set null,
  group_id        uuid references groups(id) on delete set null, -- optional: the group it concerns
  category        text not null check (category in (
                    'account_information',    -- incorrect account information
                    'identity_verification',  -- ID verification problems
                    'technical',              -- technical problems
                    'group_activity',         -- inappropriate group activity
                    'account_concern',        -- account-related concerns
                    'other')),
  subject         text not null,
  description     text not null,
  status          text not null default 'new' check (status in (
                    'new', 'under_review', 'investigating', 'resolved', 'closed')),
  -- How it ended. 'referred_to_group' is the honest outcome for anything
  -- that needs a financial correction: the officers act, not the sysadmin.
  resolution      text check (resolution in ('resolved', 'referred_to_group', 'no_action', 'duplicate')),
  resolution_note text,
  handled_by      uuid references members(id),  -- the admin working it
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  closed_at       timestamptz
);

create index if not exists idx_problem_reports_status   on problem_reports (status);
create index if not exists idx_problem_reports_reporter on problem_reports (reporter_id);
create index if not exists idx_problem_reports_group    on problem_reports (group_id);

-- Append-only trail of every step, so the handling history is auditable.
create table if not exists problem_report_events (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references problem_reports(id) on delete cascade,
  actor_id    uuid references members(id),
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_problem_report_events_report on problem_report_events (report_id);

-- RLS: members see and file their own reports. The API's service-role key
-- bypasses RLS for the admin console (same pattern as the other admin reads).
alter table problem_reports enable row level security;
alter table problem_report_events enable row level security;

drop policy if exists "problem_reports: read own" on problem_reports;
create policy "problem_reports: read own"
  on problem_reports for select
  to authenticated
  using (reporter_id = (select id from members where auth_id = auth.uid()));

drop policy if exists "problem_reports: file own" on problem_reports;
create policy "problem_reports: file own"
  on problem_reports for insert
  to authenticated
  with check (reporter_id = (select id from members where auth_id = auth.uid()));

drop policy if exists "problem_report_events: read own report" on problem_report_events;
create policy "problem_report_events: read own report"
  on problem_report_events for select
  to authenticated
  using (report_id in (
    select id from problem_reports
    where reporter_id = (select id from members where auth_id = auth.uid())
  ));

-- Let PostgREST serve the new tables immediately.
notify pgrst, 'reload schema';

-- =====================================================================
-- End of 0056_problem_reports.sql
-- =====================================================================
