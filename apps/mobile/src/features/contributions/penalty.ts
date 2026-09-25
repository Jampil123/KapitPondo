import { useMemo } from 'react';
import { useMyPenalties } from '../penalties/penalties.hooks';
import type { Cycle } from '../../api/cycles';
import type { Contribution } from '../../api/contributions';

/** Same rule as the API's penaltyFor(): a fixed peso amount, or a percent of the contribution due. */
export function latePenalty(cycle: Pick<Cycle, 'penalty_amount' | 'penalty_type'>, dueAmount: number): number {
  const rate = Number(cycle.penalty_amount ?? 0);
  if (!rate) return 0;
  return cycle.penalty_type === 'percent' ? Math.round(dueAmount * rate) / 100 : rate;
}

/**
 * The late penalty a member should add to this payment: their pending penalties for the cycle
 * that aren't already riding on a submission under review, or — when the server hasn't charged
 * one yet — what the cycle's rule will charge. 0 when not late.
 */
export function usePenaltyDue(groupId: string, cycle: Cycle | null, dueAmount: number, late: boolean, rows: Contribution[]): number {
  const pending = useMyPenalties(groupId, 'pending');
  return useMemo(() => {
    if (!late || !cycle) return 0;
    const underReview = new Set(rows.filter((r) => r.status === 'submitted').map((r) => r.id));
    const charged = (pending.data ?? [])
      .filter((p) => p.cycle_id === cycle.id && !(p.paid_with_contribution_id && underReview.has(p.paid_with_contribution_id)))
      .reduce((sum, p) => sum + Number(p.amount), 0);
    return charged > 0 ? Math.round(charged * 100) / 100 : latePenalty(cycle, dueAmount);
  }, [late, cycle, dueAmount, rows, pending.data]);
}
