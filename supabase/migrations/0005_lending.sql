-- =====================================================================
-- KapitPondo — 0005 Lending
-- Loans move pending → approved → (reviewed) → released → verified.
-- Interest is flat: principal × monthly rate, every month of the term.
-- =====================================================================

create table loans (
  id                        uuid primary key default gen_random_uuid(),
  loan_no                   integer not null,   -- per-group sequence, assigned on insert
  membership_id             uuid not null references memberships(id) on delete cascade,
  group_id                  uuid not null references groups(id),
  head_no                   int not null default 1 check (head_no >= 1),   -- 1 = the member themselves

  -- terms
  principal                 numeric(14,2) not null check (principal > 0),   -- requested
  approved_principal        numeric(14,2) check (approved_principal > 0),
  interest_rate             numeric(6,4) not null default 0,   -- monthly, 0.0300 = 3%
  term_months               int not null check (term_months > 0),
  purpose                   text,
  status                    loan_status not null default 'pending',
  outstanding_balance       numeric(14,2) not null default 0,
  rejection_reason          text,
  applied_at                timestamptz not null default now(),

  -- approval
  approved_by               uuid references members(id),
  approved_at               timestamptz,

  -- before-release review (officer loans)
  review_required           boolean not null default false,
  reviewed_by               uuid references members(id),
  reviewed_at               timestamptz,
  review_note               text,

  -- release, then verification (which posts to the ledger)
  disbursed_by              uuid references members(id),
  disbursed_at              timestamptz,
  release_verified_by       uuid references members(id),
  release_verified_at       timestamptz,
  disbursed_ledger_entry_id uuid references ledger_entries(id),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint loans_loan_no_unique unique (group_id, loan_no)
);
create index idx_loans_membership on loans (membership_id);
create index idx_loans_status     on loans (status);
-- Each head can carry at most one loan in progress.
create unique index loans_one_open_per_head
  on loans (membership_id, head_no) where status in ('pending', 'approved', 'active');

create trigger trg_loans_updated before update on loans
  for each row execute function set_updated_at();

-- Numbers loans 1, 2, 3 … per group.
create or replace function assign_loan_no()
returns trigger language plpgsql as $$
begin
  if new.loan_no is null then
    perform pg_advisory_xact_lock(hashtext('loan_no:' || new.group_id::text));
    select coalesce(max(loan_no), 0) + 1 into new.loan_no
    from loans where group_id = new.group_id;
  end if;
  return new;
end; $$;

create trigger loans_assign_loan_no before insert on loans
  for each row execute function assign_loan_no();

-- Loan repayment claims; same confirm → verify flow as contributions.
create table loan_payments (
  id                 uuid primary key default gen_random_uuid(),
  loan_id            uuid not null references loans(id) on delete cascade,
  amount             numeric(14,2) not null check (amount > 0),
  principal_portion  numeric(14,2) not null default 0,
  interest_portion   numeric(14,2) not null default 0,
  due_date           date,
  paid_date          date,
  status             loan_payment_status not null default 'scheduled',
  rejection_reason   text,

  -- how it was paid
  payment_method     payment_method,
  is_walk_in         boolean not null default false,
  proof_url          text,
  proof_reading      jsonb,
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
  constraint loanpay_segregation
    check (approved_by is null or recorded_by is null or approved_by <> recorded_by)
);
create index idx_loan_payments_loan on loan_payments (loan_id);

create trigger trg_loan_payments_updated before update on loan_payments
  for each row execute function set_updated_at();
