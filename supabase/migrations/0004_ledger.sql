-- =====================================================================
-- KapitPondo — 0004 Ledger, contributions & penalties
-- =====================================================================

-- The append-only ledger: the financial source of truth.
create table ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  entry_no          integer not null,   -- per-group sequence, assigned on insert
  group_id          uuid not null references groups(id),
  membership_id     uuid references memberships(id),   -- null for group-level entries
  cycle_id          uuid references cycles(id),
  entry_type        ledger_entry_type not null,
  direction         ledger_direction not null,
  amount            numeric(14,2) not null check (amount > 0),
  source_type       text,   -- 'contribution' | 'loan' | 'loan_payment' | 'distribution' | ...
  source_id         uuid,   -- id of the originating claim row (no FK: polymorphic)
  reverses_entry_id uuid references ledger_entries(id),
  description       text,
  posted_by         uuid not null references members(id),
  posted_at         timestamptz not null default now(),
  constraint ledger_entries_entry_no_unique unique (group_id, entry_no)
);
create index idx_ledger_group      on ledger_entries (group_id);
create index idx_ledger_membership on ledger_entries (membership_id);
create index idx_ledger_source     on ledger_entries (source_type, source_id);

create trigger ledger_no_update before update on ledger_entries
  for each row execute function prevent_ledger_mutation();
create trigger ledger_no_delete before delete on ledger_entries
  for each row execute function prevent_ledger_mutation();

-- Numbers entries 1, 2, 3 … per group. The advisory lock serializes
-- concurrent inserts for the same group.
create or replace function assign_ledger_entry_no()
returns trigger language plpgsql as $$
begin
  if new.entry_no is null then
    perform pg_advisory_xact_lock(hashtext('ledger_entry_no:' || new.group_id::text));
    select coalesce(max(entry_no), 0) + 1 into new.entry_no
    from ledger_entries where group_id = new.group_id;
  end if;
  return new;
end; $$;

create trigger ledger_assign_entry_no before insert on ledger_entries
  for each row execute function assign_ledger_entry_no();

-- Contribution claims. Money in flows:
--   submitted ──confirm──▶ confirmed ──verify──▶ approved (posted to the ledger)
create table contributions (
  id                 uuid primary key default gen_random_uuid(),
  membership_id      uuid not null references memberships(id) on delete cascade,
  cycle_id           uuid not null references cycles(id) on delete cascade,
  group_id           uuid not null references groups(id),
  amount             numeric(14,2) not null check (amount >= 0),
  due_date           date,
  paid_date          date,
  is_late            boolean not null default false,
  penalty_applied    numeric(14,2) not null default 0,
  status             contribution_status not null default 'pending',
  rejection_reason   text,

  -- how it was paid
  payment_method     payment_method,
  is_walk_in         boolean not null default false,
  proof_url          text,
  proof_reading      jsonb,   -- what was read off the proof image
  proof_read_at      timestamptz,
  external_reference text,

  -- who did what
  recorded_by        uuid references members(id),
  confirmed_by       uuid references members(id),
  confirmed_at       timestamptz,
  approved_by        uuid references members(id),
  ledger_entry_id    uuid references ledger_entries(id),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- The recorder may not approve their own record, except a walk-in.
  constraint contrib_segregation
    check (approved_by is null or recorded_by is null or approved_by <> recorded_by or is_walk_in)
);
create index idx_contributions_membership on contributions (membership_id);
create index idx_contributions_cycle      on contributions (cycle_id);
create index idx_contributions_status     on contributions (status);
-- One 'late' row per member per due date.
create unique index uq_contributions_late_period
  on contributions (membership_id, cycle_id, due_date) where status = 'late';

create trigger trg_contributions_updated before update on contributions
  for each row execute function set_updated_at();

-- Late-contribution penalties.
create table penalties (
  id                        uuid primary key default gen_random_uuid(),
  group_id                  uuid not null references groups(id) on delete cascade,
  membership_id             uuid not null references memberships(id) on delete cascade,
  cycle_id                  uuid references cycles(id) on delete set null,
  contribution_id           uuid references contributions(id) on delete set null,   -- the late contribution
  paid_with_contribution_id uuid references contributions(id) on delete set null,
  amount                    numeric(14,2) not null check (amount >= 0),
  reason                    text not null default 'Late contribution',
  status                    penalty_status not null default 'pending',
  waived_by                 uuid references members(id),
  waived_at                 timestamptz,
  waive_reason              text,
  ledger_entry_id           uuid references ledger_entries(id),   -- set once paid
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index idx_penalties_group      on penalties (group_id);
create index idx_penalties_membership on penalties (membership_id);
create index idx_penalties_paid_with  on penalties (paid_with_contribution_id);
create unique index uq_penalties_contribution
  on penalties (contribution_id) where contribution_id is not null;

-- Reversal workflow: initiate → verify → finalize (posts the reversing entry).
create table ledger_reversal_requests (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  entry_id          uuid not null references ledger_entries(id),
  reason            text not null,
  status            reversal_request_status not null default 'pending_verification',
  initiated_by      uuid not null references members(id),
  initiated_at      timestamptz not null default now(),
  verified_by       uuid references members(id),
  verified_at       timestamptz,
  verify_notes      text,
  finalized_by      uuid references members(id),
  finalized_at      timestamptz,
  reversal_entry_id uuid references ledger_entries(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_reversal_requests_group on ledger_reversal_requests (group_id);
create index idx_reversal_requests_entry on ledger_reversal_requests (entry_id);
