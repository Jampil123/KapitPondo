/**
 * lib/cycle.ts
 * ----------------------------------------------------------------------------
 * Pure date math for cycles. No "of N" total — cycles don't have a fixed
 * duration (end_date is optional/open-ended), so this only computes which
 * period we're currently in.
 */
import type { Frequency } from '../api/cycles';

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
