import type { Contribution } from '../../api/contributions';
import type { Cycle, Frequency } from '../../api/cycles';
import { parseApiDate } from '../../lib/cycle';

export type PeriodKind = 'paid' | 'review' | 'rejected' | 'late' | 'due' | 'upcoming';

export interface PeriodEntry {
  index: number;
  periodStart: Date;
  dueDate: Date;
  row: Contribution | null;
  kind: PeriodKind;
  /** What the period requires: row.amount_due (heads changed after paying), else what was paid incl. credit; cycle.contribution_amount × heads with no row. */
  amount: number;
  /** Still owed on a paid period whose heads went up afterwards (0068); 0 otherwise. */
  balance: number;
  /** The latest payment toward `balance` while it's in review or was rejected — what the period's status follows then. */
  topUp: Contribution | null;
}

const IN_REVIEW: Contribution['status'][] = ['submitted', 'confirmed'];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Advance credit a new payment can still use — the balance less what payments in review already earmarked. */
export function availableCredit(contributionCredit: number | string | null | undefined, rows: Contribution[]): number {
  const reserved = rows
    .filter((r) => IN_REVIEW.includes(r.status))
    .reduce((s, r) => s + Number(r.credit_applied ?? 0), 0);
  return Math.max(round2(Number(contributionCredit ?? 0) - reserved), 0);
}

/** A period row's requirement and what's still owed on it, counting approved top-ups. */
function settle(row: Contribution, topUps: Contribution[]) {
  const due = row.amount_due != null ? Number(row.amount_due) : Number(row.amount) + Number(row.credit_applied ?? 0);
  if (row.status !== 'approved') return { due, balance: 0, topUp: null };
  const toppedUp = topUps.filter((t) => t.status === 'approved').reduce((s, t) => s + Number(t.amount), 0);
  const covered = Number(row.amount) + Number(row.credit_applied ?? 0) - Number(row.credit_granted ?? 0) + toppedUp;
  const balance = Math.max(round2(due - covered), 0);
  const last = topUps[topUps.length - 1] ?? null;
  return { due, balance, topUp: balance > 0 && last && last.status !== 'approved' ? last : null };
}

/** Every period's start date between a cycle's start and end, stepped by its frequency. Empty if the cycle is open-ended (no end_date to count periods against). */
export function cyclePeriods(cycle: { start_date: string; end_date: string | null; frequency: string }): Date[] {
  if (!cycle.end_date) return [];
  const start = parseApiDate(cycle.start_date);
  const end = parseApiDate(cycle.end_date);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const dates: Date[] = [];
  for (let i = 0; i < 120; i++) {
    const d = periodStartAt(start, cycle.frequency, i);
    if (d > end) break;
    dates.push(d);
  }
  return dates;
}

/**
 * The nth period's start, counted from the cycle's start. Month-based cadences
 * are computed from the original start rather than stepped from the previous
 * period, and the day is clamped to the target month's length — stepping a
 * Date in place from the 31st overflows (Oct 31 + 1 month = Dec 1), which
 * skips November and shifts every later period off by a month.
 */
function periodStartAt(start: Date, frequency: string, n: number): Date {
  if (frequency === 'weekly') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * n);
  if (frequency === 'biweekly') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 14 * n);
  const months = n * (frequency === 'quarterly' ? 3 : 1);
  const daysInTarget = new Date(start.getFullYear(), start.getMonth() + months + 1, 0).getDate();
  return new Date(start.getFullYear(), start.getMonth() + months, Math.min(start.getDate(), daysInTarget));
}

/** The calendar due date for a period — contribution_due_day only means anything for a monthly cadence (it's what the server's own lazy check assumes too). */
export function periodDueDate(periodStart: Date, cycle: { frequency: string; contribution_due_day: number | null }): Date {
  if (cycle.frequency === 'monthly' && cycle.contribution_due_day) {
    const daysInMonth = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
    return new Date(periodStart.getFullYear(), periodStart.getMonth(), Math.min(cycle.contribution_due_day, daysInMonth));
  }
  return periodStart;
}

/**
 * Whether a member's heads count can be changed right now — open until the
 * cycle's first due date (inclusive), then locked for the rest of the cycle.
 * No active cycle, or one that hasn't started, is freely editable. Mirrors
 * setHeads() in the API's distributions.service.js, which enforces it.
 */
export function isHeadsEditable(
  cycle: { start_date: string; frequency: string; contribution_due_day: number | null } | null,
  now: Date = new Date(),
): boolean {
  if (!cycle) return true;
  // Date-only comparison, so the whole due day still counts as open.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = parseApiDate(cycle.start_date);
  if (today < start) return true;
  return today <= periodDueDate(start, cycle);
}

export function periodLabel(periodStart: Date, frequency: Frequency | string, short = false): string {
  if (frequency === 'weekly') return `Week of ${periodStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`;
  if (frequency === 'biweekly') return `Period of ${periodStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`;
  if (frequency === 'quarterly') return `Q${Math.floor(periodStart.getMonth() / 3) + 1} ${periodStart.getFullYear()}`;
  return periodStart.toLocaleDateString('en-PH', short ? { month: 'long' } : { month: 'long', year: 'numeric' });
}

/**
 * 0-based index into cyclePeriods() for whichever period contains "now" — the
 * one period everyone should be paying right now, same for every member.
 * Clamped into range: before the cycle starts this is period 0 (nothing paid
 * yet is correct there), and once the whole cycle has elapsed it's the last
 * period. Null only for an open-ended cycle (no end_date, so no period list
 * to index into at all).
 *
 * Deliberately NOT "this member's first unpaid period" (that's what
 * buildTimeline + picking the first non-'paid' entry gives you, and it's the
 * right question for that member's OWN dashboard card). A member who's paid
 * ahead has their own next-due period roll forward to next month — but an
 * owner's "this month's collection" should stay on THIS month for everyone
 * until the calendar actually moves, or a member paying early makes their
 * payment vanish from this month's total the instant it's approved.
 */
export function currentPeriodIndex(
  cycle: { start_date: string; end_date: string | null; frequency: string },
  now: Date = new Date(),
): number | null {
  const periods = cyclePeriods(cycle);
  if (!periods.length) return null;
  const elapsed = periods.filter((p) => p <= now).length;
  return Math.min(Math.max(elapsed - 1, 0), periods.length - 1);
}

function rowKind(row: Contribution): PeriodKind {
  if (row.status === 'approved') return 'paid';
  if (row.status === 'submitted' || row.status === 'confirmed') return 'review';
  if (row.status === 'rejected') return 'rejected';
  if (row.is_late) return 'late';
  return 'due';
}

function sortRows(rows: Contribution[]): Contribution[] {
  return [...rows].sort((a, b) => {
    const at = a.due_date ? parseApiDate(a.due_date).getTime() : new Date(a.created_at).getTime();
    const bt = b.due_date ? parseApiDate(b.due_date).getTime() : new Date(b.created_at).getTime();
    return at - bt;
  });
}

/**
 * Drops a 'rejected' row once a strictly later row exists for this member.
 *
 * The mapping below assigns rows to periods purely by position (sorted[i] ->
 * periods[i]), which assumes exactly one row per period. A resubmission
 * breaks that: it always INSERTS a new row rather than editing the rejected
 * one it's fixing (contributions.service.js: rejectContribution only flips
 * status on that same row; submitContribution always inserts) — so a
 * rejected-then-resubmitted period briefly has TWO rows, which shifts every
 * period after it out of alignment (the resubmission lands on the WRONG
 * period, and the period it actually belongs to keeps showing the stale
 * rejected row). Collapsing the superseded rejection back to one row per
 * period before the positional mapping fixes both.
 */
function collapseSupersededRejections(sorted: Contribution[]): Contribution[] {
  return sorted.filter((row, i) => !(row.status === 'rejected' && i < sorted.length - 1));
}

/** The full period-by-period timeline for one member's own rows in a cycle, oldest first. */
export function buildTimeline(
  cycle: Pick<Cycle, 'start_date' | 'end_date' | 'frequency' | 'contribution_due_day' | 'contribution_amount'>,
  rows: Contribution[],
  heads: number,
): PeriodEntry[] {
  // Top-ups pay an earlier period's balance — they hang off that period's row
  // instead of taking a period of their own in the positional mapping below.
  const topUpsOf = new Map<string, Contribution[]>();
  for (const t of sortRows(rows.filter((r) => r.top_up_of))) {
    topUpsOf.set(t.top_up_of!, [...(topUpsOf.get(t.top_up_of!) ?? []), t]);
  }
  const sorted = sortRows(rows.filter((r) => !r.top_up_of));
  const periods = cyclePeriods(cycle);
  const now = new Date();
  const expected = Number(cycle.contribution_amount) * heads;

  const rowEntry = (index: number, periodStart: Date, dueDate: Date, row: Contribution): PeriodEntry => {
    const { due, balance, topUp } = settle(row, topUpsOf.get(row.id) ?? []);
    const kind: PeriodKind = !balance ? rowKind(row)
      : topUp ? rowKind(topUp)
      : now > dueDate ? 'late' : 'due';
    return { index, periodStart, dueDate, row, kind, amount: due, balance, topUp };
  };

  if (!periods.length) {
    // Open-ended cycle — no fixed roster to fill in; just the real rows, in
    // order. Still needs the same collapse as below: a resubmission inserts
    // a NEW row rather than editing the rejected one, so without this an
    // approved resubmission would leave its now-stale rejected row still
    // showing as the "current" entry.
    return collapseSupersededRejections(sorted).map((row, index) => {
      const date = row.due_date ? parseApiDate(row.due_date) : new Date(row.created_at);
      return rowEntry(index, date, date, row);
    });
  }

  const collapsed = collapseSupersededRejections(sorted);
  // A period only counts as "settled" once its row is actually approved and
  // nothing is still owed on it — while it's under review, was rejected and
  // hasn't been resubmitted, or still has a balance from a heads increase,
  // the NEXT period must not light up as due/late. Otherwise submitting proof
  // (or resubmitting after a rejection) immediately advances a second dot
  // before the current one is even resolved, instead of looping on the same
  // one until an officer approves it.
  const lastRow = collapsed[collapsed.length - 1] ?? null;
  const lastRowSettled = !lastRow || (lastRow.status === 'approved' && !settle(lastRow, topUpsOf.get(lastRow.id) ?? []).balance);

  return periods.map((periodStart, index) => {
    const row = collapsed[index] ?? null;
    const dueDate = periodDueDate(periodStart, cycle);
    if (row) return rowEntry(index, periodStart, dueDate, row);
    // Only the period right after the member's last SETTLED row can already be
    // due/late — everything further out hasn't opened yet.
    const isNextUnpaid = index === collapsed.length && lastRowSettled;
    const kind: PeriodKind = isNextUnpaid ? (now > dueDate ? 'late' : 'due') : 'upcoming';
    return { index, periodStart, dueDate, row: null, kind, amount: expected, balance: 0, topUp: null };
  });
}
