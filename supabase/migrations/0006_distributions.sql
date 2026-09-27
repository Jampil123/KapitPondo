-- =====================================================================
-- KapitPondo — 0006 Distributions (dividends)
-- draft → previewed → verified → finalized. Shares are allocated by heads.
-- =====================================================================

create table distributions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  cycle_id     uuid references cycles(id),
  period       text not null,
  total_amount numeric(14,2) not null default 0,
  rate         numeric(6,4),
  status       distribution_status not null default 'draft',
  declared_by  uuid references members(id),
  verified_by  uuid references members(id),
  verified_at  timestamptz,
  verify_notes text,
  finalized_by uuid references members(id),
  finalized_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_distributions_updated before update on distributions
  for each row execute function set_updated_at();

create table distribution_allocations (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references distributions(id) on delete cascade,
  membership_id   uuid not null references memberships(id) on delete cascade,
  amount          numeric(14,2) not null default 0,
  ledger_entry_id uuid references ledger_entries(id),
  created_at      timestamptz not null default now(),
  unique (distribution_id, membership_id)
);
create index idx_dist_alloc_distribution on distribution_allocations (distribution_id);
create index idx_dist_alloc_membership   on distribution_allocations (membership_id);
