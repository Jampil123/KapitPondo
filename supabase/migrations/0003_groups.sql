-- =====================================================================
-- KapitPondo — 0003 Groups & membership
-- A group is one cooperative fund. Members join through memberships,
-- which carry the role and the number of heads they contribute for.
-- =====================================================================

create table groups (
  id                               uuid primary key default gen_random_uuid(),
  name                             text not null,
  fund_code                        text unique not null,   -- join code
  description                      text,
  owner_id                         uuid not null references members(id),
  status                           group_status not null default 'active',

  -- Treasurer's GCash payout details. The approved values are the live
  -- ones; pending_* hold a submitted change until the Organizer reviews it.
  treasurer_gcash_number           text,
  treasurer_gcash_name             text,
  treasurer_gcash_qr_url           text,
  treasurer_gcash_status           text not null default 'unset'
    constraint groups_treasurer_gcash_status_check
    check (treasurer_gcash_status in ('unset', 'pending', 'approved', 'rejected')),
  treasurer_gcash_pending_number   text,
  treasurer_gcash_pending_name     text,
  treasurer_gcash_pending_qr_url   text,
  treasurer_gcash_note             text,
  treasurer_gcash_rejection_reason text,
  treasurer_gcash_submitted_by     uuid references members(id),
  treasurer_gcash_submitted_at     timestamptz,
  treasurer_gcash_reviewed_by      uuid references members(id),
  treasurer_gcash_reviewed_at      timestamptz,

  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);

create trigger trg_groups_updated before update on groups
  for each row execute function set_updated_at();

-- A member's place in a group. `heads` = the member plus the people
-- outside the group they contribute for; each head is one share.
create table memberships (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references members(id) on delete cascade,
  group_id         uuid not null references groups(id) on delete cascade,
  role             membership_role not null default 'member',
  status           membership_status not null default 'pending',
  heads            integer not null default 1 check (heads >= 1),
  joined_at        timestamptz,
  approved_by      uuid references members(id),
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (member_id, group_id)
);
create index idx_memberships_member on memberships (member_id);
create index idx_memberships_group  on memberships (group_id);

create trigger trg_memberships_updated before update on memberships
  for each row execute function set_updated_at();

-- Optional display names for heads 2..n ("Head 2 · Pedro").
-- Head 1 is always the member's own name.
create table membership_head_names (
  membership_id uuid not null references memberships(id) on delete cascade,
  head_no       int  not null check (head_no >= 2),
  name          text not null check (length(btrim(name)) between 1 and 80),
  updated_at    timestamptz not null default now(),
  primary key (membership_id, head_no)
);

-- A group's contribution cycle and its loan defaults.
create table cycles (
  id                        uuid primary key default gen_random_uuid(),
  group_id                  uuid not null references groups(id) on delete cascade,
  name                      text not null,
  contribution_amount       numeric(14,2) not null check (contribution_amount >= 0),
  frequency                 text not null default 'monthly',
  contribution_due_day      int check (contribution_due_day between 1 and 31),
  penalty_amount            numeric(14,2) not null default 0,
  penalty_type              text not null default 'fixed',   -- 'fixed' or 'percent'
  default_interest_rate     numeric(6,4) check (default_interest_rate >= 0),
  minimum_loan_amount       numeric(14,2) check (minimum_loan_amount >= 0),
  early_termination_penalty numeric(14,2) check (early_termination_penalty >= 0),
  start_date                date not null,
  end_date                  date,
  status                    cycle_status not null default 'draft',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index idx_cycles_group on cycles (group_id);
create unique index one_active_cycle_per_group on cycles (group_id) where status = 'active';

create trigger trg_cycles_updated before update on cycles
  for each row execute function set_updated_at();

-- Cached per-membership balances (derived from the ledger).
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  account_type  account_type not null default 'savings',
  balance       numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (membership_id, account_type)
);
create index idx_accounts_membership on accounts (membership_id);

create trigger trg_accounts_updated before update on accounts
  for each row execute function set_updated_at();
