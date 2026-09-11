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
  /** row.amount when there's a row; cycle.contribution_amount × heads when there isn't. */
  amount: number;
}

/** Every period's start date between a cycle's start and end, stepped by its frequency. Empty if the cycle is open-ended (no end_date to count periods against). */
export function cyclePeriods(cycle: { start_date: string; end_date: string | null; frequency: string }): Date[] {
  if (!cycle.end_date) return [];
  const start = parseApiDate(cycle.start_date);
  const end = parseApiDate(cycle.end_date);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const dates: Date[] = [];
  const d = new Date(start);
  let guard = 0;
  while (d <= end && guard < 120) {
    dates.push(new Date(d));
    if (cycle.frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (cycle.frequency === 'biweekly') d.setDate(d.getDate() + 14);
    else if (cycle.frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
    else d.setMonth(d.getMonth() + 1);
    guard++;
  }
  return dates;
}

/** The calendar due date for a period — contribution_due_day only means anything for a monthly cadence (it's what the server's own lazy check assumes too). */
export function periodDueDate(periodStart: Date, cycle: { frequency: string; contribution_due_day: number | null }): Date {
  if (cycle.frequency === 'monthly' && cycle.contribution_due_day) {
    return new Date(periodStart.getFullYear(), periodStart.getMonth(), cycle.contribution_due_day);
  }
  return periodStart;
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
  if (row.status === 'submitted') return 'review';
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
  const sorted = sortRows(rows);
  const periods = cyclePeriods(cycle);
  const now = new Date();
  const expected = Number(cycle.contribution_amount) * heads;

  if (!periods.length) {
    // Open-ended cycle — no fixed roster to fill in; just the real rows, in order.
    return sorted.map((row, index) => ({
      index,
      periodStart: row.due_date ? parseApiDate(row.due_date) : new Date(row.created_at),
      dueDate: row.due_date ? parseApiDate(row.due_date) : new Date(row.created_at),
      row,
      kind: rowKind(row),
      amount: Number(row.amount),
    }));
  }

  const collapsed = collapseSupersededRejections(sorted);

  return periods.map((periodStart, index) => {
    const row = collapsed[index] ?? null;
    const dueDate = periodDueDate(periodStart, cycle);
    if (row) return { index, periodStart, dueDate, row, kind: rowKind(row), amount: Number(row.amount) };
    // Only the period right after the member's last row can already be due/late —
    // everything further out hasn't opened yet.
    const isNextUnpaid = index === collapsed.length;
    const kind: PeriodKind = isNextUnpaid ? (now > dueDate ? 'late' : 'due') : 'upcoming';
    return { index, periodStart, dueDate, row: null, kind, amount: expected };
  });
}
