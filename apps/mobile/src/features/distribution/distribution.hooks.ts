/**
 * features/distribution/distribution.hooks.ts
 * ----------------------------------------------------------------------------
 * Hooks for the year-end distribution (M9).
 *
 *   // Owner/treasurer: build the preview
 *   const { run: preview } = usePreviewDistribution(groupId);
 *   const res = await preview('2026');   // res.distribution, res.allocations
 *
 *   // Review screen
 *   const { data } = useDistribution(groupId, id);   // data.distribution, data.allocations
 *
 *   // Owner: finalize (immutable). Handle the 409 "fund changed" case.
 *   const { run: finalize, error } = useFinalizeDistribution(groupId);
 *   const ok = await finalize(id);
 *   if (!ok && error?.status === 409) { ...prompt to re-preview... }
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import {
  listDistributions,
  getDistribution,
  previewDistribution,
  finalizeDistribution,
  cancelDistribution,
  setHeads,
} from '../../api/distribution';

export function useDistributions(groupId: string) {
  const fn = useCallback(() => listDistributions(groupId), [groupId]);
  return useQuery(fn, [groupId]);
}

/** Safe to call with no id yet (e.g. still resolving which distribution is latest). */
export function useDistribution(groupId: string, id?: string) {
  const fn = useCallback(
    () => (id ? getDistribution(groupId, id) : Promise.resolve(null)),
    [groupId, id],
  );
  return useQuery(fn, [groupId, id]);
}

export function usePreviewDistribution(groupId: string) {
  return useAction((period: string) => previewDistribution(groupId, period));
}

/** finalize(id) — returns the finalized detail, or sets error.status 409 if the fund moved. */
export function useFinalizeDistribution(groupId: string) {
  return useAction((id: string) => finalizeDistribution(groupId, id));
}

export function useCancelDistribution(groupId: string) {
  return useAction((id: string) => cancelDistribution(groupId, id));
}

/** setHeads(membershipId, heads) — owner adjusts a member's share before preview. */
export function useSetHeads(groupId: string) {
  return useAction((membershipId: string, heads: number) => setHeads(groupId, membershipId, heads));
}