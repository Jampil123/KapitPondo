-- =====================================================================
-- KapitPondo — Migration 0025
-- QA fixes for M5 (Contributions):
--   TC-025: contribution rejection had no reason column at all.
--   TC-039: nothing ever flagged a missed contribution as Late or charged
--           a penalty — `is_late`/`penalty_applied` existed on
--           `contributions` already (migration 0001) but nothing ever set
--           them. Adds the 'late' status so a missed period is visible in
--           the member's own contribution history, not just silence.
--   TC-017: penalties are tracked as their own pending/waived/paid record
--           (not a ledger entry) so an unpaid penalty never distorts
--           available cash — see the "pending charge until collected"
--           design decision. Waiving cancels the pending charge outright;
--           only an actually-paid penalty ever posts to the ledger.
-- =====================================================================

alter table contributions
  add column if not exists rejection_reason text;

alter type contribution_status add value if not exists 'late';

create type penalty_status as enum ('pending', 'waived', 'paid');

create table penalties (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups(id) on delete cascade,
  membership_id   uuid not null references memberships(id) on delete cascade,
  cycle_id        uuid references cycles(id) on delete set null,
  contribution_id uuid references contributions(id) on delete set null,
  amount          numeric(14,2) not null check (amount >= 0),
  reason          text not null default 'Late contribution',
  status          penalty_status not null default 'pending',
  waived_by       uuid references members(id),
  waived_at       timestamptz,
  waive_reason    text,
  ledger_entry_id uuid references ledger_entries(id), -- set only once actually paid
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_penalties_group      on penalties (group_id);
create index idx_penalties_membership on penalties (membership_id);

-- =====================================================================
-- End of 0025_contributions_reason_and_penalties.sql
-- =====================================================================
