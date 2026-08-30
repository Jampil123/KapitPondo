/**
 * lib/cycle.ts
 * ----------------------------------------------------------------------------
 * Pure date math for cycles. No "of N" total — cycles don't have a fixed
 * duration (end_date is optional/open-ended), so this only computes which
 * period we're currently in.
 */
import type { Frequency } from '../api/cycles';

/**
 * Safely parse a Postgres `date` column (date-only, no timezone — e.g.
 * cycles.start_date/end_date, contributions.due_date/paid_date). PostgREST
 * serializes these as bare "YYYY-MM-DD" strings, and `new Date("YYYY-MM-DD")`
 * parses that as UTC MIDNIGHT — reading it back with local getters
 * (getMonth/getDate) then rolls the calendar day back by one on any device
 * west of UTC (e.g. a Sept 1 due date reads back as Aug 31, and a due-day
 * calculation built on top of that lands a full month early). These are
 * civil dates with no instant-in-time meaning, so parse as LOCAL midnight
 * instead. Falls through to normal parsing for anything else (timestamptz
 * fields like created_at, which already carry real timezone info).
 */
export function parseApiDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

const PERIOD_DAYS: Record<Frequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30, // placeholder for the day-based branch; monthly uses calendar months instead
  quarterly: 91,
};

/** 1-indexed period number since the cycle started (e.g. "Month 5"). */
export function periodsSinceStart(startDate: string, frequency: Frequency): number {
  const start = new Date(startDate);
  const today = new Date();
  if (Number.isNaN(start.getTime())) return 1;

  if (frequency === 'monthly') {
    const months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
  }

  const days = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(days / PERIOD_DAYS[frequency]) + 1);
}
