/**
 * features/reporting/reporting.hooks.ts
 * ----------------------------------------------------------------------------
 * Read-only hooks for dashboards and the ledger feed (M8).
 *
 *   const { data: summary } = useSummary(groupId);          // officer dashboard
 *   const { data: balances } = useMemberBalances(groupId);  // officer table
 *   const { data: myBalance } = useMyBalance(groupId);      // every member's home
 *   const { data: entries } = useLedger(groupId, { entry_type, limit });
 */
import { useCallback } from 'react';
import { useQuery } from '../../hooks/useApi';
import {
  getSummary,
  getFundSummary,
  getMemberBalances,
  getLedger,
  getMyBalance,
  type LedgerFilters,
} from '../../api/reporting';

export function useSummary(groupId: string) {
  const fn = useCallback(() => getSummary(groupId), [groupId]);
  return useQuery(fn, [groupId]);
}

/** Member-safe aggregate fund snapshot (any role) — the Fund tile. */
export function useFundSummary(groupId: string) {
  const fn = useCallback(() => getFundSummary(groupId), [groupId]);
  return useQuery(fn, [groupId]);
}

export function useMemberBalances(groupId: string) {
  const fn = useCallback(() => getMemberBalances(groupId), [groupId]);
  return useQuery(fn, [groupId]);
}

export function useMyBalance(groupId: string) {
  const fn = useCallback(() => getMyBalance(groupId), [groupId]);
  return useQuery(fn, [groupId]);
}

export function useLedger(groupId: string, filters: LedgerFilters = {}) {
  const fn = useCallback(
    () => getLedger(groupId, filters),
    [groupId, filters.membership_id, filters.entry_type, filters.limit],
  );
  return useQuery(fn, [groupId, filters.membership_id, filters.entry_type, filters.limit]);
}