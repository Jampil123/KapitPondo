import type { Contribution } from '../../api/contributions';
import type { Cycle } from '../../api/cycles';
import type { GroupMember } from '../../api/groups';
import { buildTimeline, periodLabel, type PeriodEntry } from './periods';

export interface PeriodSummary {
  expected: number;
  collected: number;
  collectedCount: number;
  dueDate: Date | null;
  label: string;
  totalMembers: number;
  perMember: Map<string, PeriodEntry | null>;
}

/**
 * Collection totals and every member's entry for one period of a cycle.
 * `idx` indexes cyclePeriods(); null (open-ended cycle) falls back to each
 * member's latest entry.
 */
export function computePeriodSummary(
  cycle: Cycle,
  roster: GroupMember[],
  rows: Contribution[],
  idx: number | null,
): PeriodSummary {
  const totalHeads = roster.reduce((s, m) => s + m.heads, 0);
  const expected = totalHeads * Number(cycle.contribution_amount);
  let collected = 0, collectedCount = 0, dueDate: Date | null = null, label = '';
  const perMember = new Map<string, PeriodEntry | null>();
  for (const m of roster) {
    const memberRows = rows.filter((c) => c.membership_id === m.id);
    const timeline = buildTimeline(cycle, memberRows, m.heads);
    const entry = idx !== null ? (timeline[idx] ?? null) : (timeline[timeline.length - 1] ?? null);
    perMember.set(m.id, entry);
    if (!entry) continue;
    if (!dueDate) { dueDate = entry.dueDate; label = periodLabel(entry.periodStart, cycle.frequency); }
    if (entry.kind === 'paid') { collected += entry.amount; collectedCount++; }
  }
  return { expected, collected, collectedCount, dueDate, label, totalMembers: roster.length, perMember };
}

/** "15th" — day of month only, built by hand so it doesn't depend on the device's Intl support. */
export function dayOnly(d: Date) {
  const n = d.getDate();
  if (isNaN(n)) return '';
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
