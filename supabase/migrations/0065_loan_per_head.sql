-- =====================================================================
-- KapitPondo — Migration 0065
-- One loan slot per head.
--
-- A membership's `heads` is the member plus the people outside the group
-- they contribute for. Each head can now carry its own loan, so a member
-- with 3 heads may have up to 3 loans in progress at once (still limited
-- only by the fund's cash on hand, checked at approval/disbursement).
--
--   * loans.head_no — which head a loan is for (1 = the member themselves).
--   * A head can have at most one loan that's pending, approved or active.
--   * membership_head_names — optional display name for heads 2..n
--     ("Head 2 · Pedro"). Head 1 is always the member's own name.
--
-- Writes are backend-only (service-role); RLS is defense-in-depth.
-- =====================================================================

alter table loans
  add column if not exists head_no int not null default 1 check (head_no >= 1);

-- Existing data predates slots: if a member already has more than one open
-- loan, spread them over heads 1, 2, … so the unique index below can build.
with ranked as (
  select id, row_number() over (partition by membership_id order by created_at) as rn
  from loans
  where status in ('pending', 'approved', 'active')
)
update loans l set head_no = r.rn
from ranked r
where l.id = r.id and l.head_no <> r.rn;

create unique index if not exists loans_one_open_per_head
  on loans (membership_id, head_no)
  where status in ('pending', 'approved', 'active');

create table if not exists membership_head_names (
  membership_id uuid not null references memberships(id) on delete cascade,
  head_no       int  not null check (head_no >= 2),
  name          text not null check (length(btrim(name)) between 1 and 80),
  updated_at    timestamptz not null default now(),
  primary key (membership_id, head_no)
);

alter table membership_head_names enable row level security;

-- Same visibility as the member directory: anyone in the group may read.
create policy "membership_head_names: read within group"
  on membership_head_names for select
  to authenticated
  using (exists (
    select 1
    from memberships target
    join memberships mine on mine.group_id = target.group_id
    join members me on me.id = mine.member_id
    where target.id = membership_head_names.membership_id
      and me.auth_id = auth.uid()
  ));

-- =====================================================================
-- End of 0065_loan_per_head.sql
-- =====================================================================
