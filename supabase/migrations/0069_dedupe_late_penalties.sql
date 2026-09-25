-- =====================================================================
-- KapitPondo — Migration 0069
-- checkLatePenalties() charged the same late period many times over:
--   * concurrent checks (every officer list view triggers one) each saw
--     "not charged yet" and inserted their own row, and
--   * its "already charged?" lookup used maybeSingle(), which returns null
--     once two rows match — so after the first duplicate, every later check
--     charged again (one member reached 65 × ₱150).
-- It also charged a period whose due day fell before the cycle's start.
--
-- None of these penalties ever reached the ledger (only a paid penalty
-- posts), so removing them changes no balance. Anything already waived or
-- paid is kept as-is.
--
-- The unique index at the end makes a second charge for the same period
-- impossible; the API treats that conflict as "already charged".
-- =====================================================================

-- 1. Late periods that fall before their cycle started.
with bogus as (
  select c.id
  from contributions c
  join cycles cy on cy.id = c.cycle_id
  where c.status = 'late'
    and c.due_date < cy.start_date
    and not exists (select 1 from penalties p where p.contribution_id = c.id and p.status <> 'pending')
), dropped_penalties as (
  delete from penalties where contribution_id in (select id from bogus) and status = 'pending'
  returning id
)
delete from contributions where id in (select id from bogus);

-- 2. Duplicate charges for the same member, cycle and due date: keep one —
--    the one whose penalty was already waived/paid if there is one, otherwise
--    the earliest.
with ranked as (
  select
    c.id,
    exists (select 1 from penalties p where p.contribution_id = c.id and p.status <> 'pending') as settled,
    row_number() over (
      partition by c.membership_id, c.cycle_id, c.due_date
      order by exists (select 1 from penalties p where p.contribution_id = c.id and p.status <> 'pending') desc, c.created_at, c.id
    ) as rn
  from contributions c
  where c.status = 'late'
), extra as (
  select id from ranked where rn > 1 and not settled
), dropped_penalties as (
  delete from penalties where contribution_id in (select id from extra) and status = 'pending'
  returning id
)
delete from contributions where id in (select id from extra);

-- 3. One late charge per member, cycle and due date; one penalty per late row.
create unique index if not exists uq_contributions_late_period
  on contributions (membership_id, cycle_id, due_date)
  where status = 'late';

create unique index if not exists uq_penalties_contribution
  on penalties (contribution_id)
  where contribution_id is not null;

-- =====================================================================
-- End of 0069_dedupe_late_penalties.sql
-- =====================================================================
