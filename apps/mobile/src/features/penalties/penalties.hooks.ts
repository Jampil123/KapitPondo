/**
 * features/penalties/penalties.hooks.ts
 * ----------------------------------------------------------------------------
 * Hooks for the Penalties Review screen (M5.4).
 *
 *   const { data: pending } = usePenalties(groupId, 'pending');
 *   const { run: waive, error } = useWaivePenalty(groupId);
 *   const ok = await waive(penaltyId, reason);
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import { listPenalties, waivePenalty, type PenaltyStatus } from '../../api/penalties';

export function usePenalties(groupId: string, status?: PenaltyStatus) {
  const fn = useCallback(() => listPenalties(groupId, status), [groupId, status]);
  return useQuery(fn, [groupId, status], { table: 'penalties', filter: `group_id=eq.${groupId}` });
}

export function useWaivePenalty(groupId: string) {
  return useAction((penaltyId: string, reason: string) => waivePenalty(groupId, penaltyId, reason));
}
