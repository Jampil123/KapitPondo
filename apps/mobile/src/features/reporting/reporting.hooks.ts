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
  getFundLedger,
  getFundTotals,
  getMemberBalances,
  getLedger,
  getMyBalance,
  type LedgerFilters,
} from '../../api/reporting';

// Every dashboard money figure ultimately derives from ledger_entries (the
// only place a claim becomes real cash — see contributions/loans/expenses
// services) plus loans.outstanding_balance, which is written directly on
// approve/disburse/repay rather than summed live. Watching both keeps these
// numbers live the instant any officer action posts.
function fundWatch(groupId: string) {
  return [
    { table: 'ledger_entries', filter: `group_id=eq.${groupId}` },
    { table: 'loans', filter: `group_id=eq.${groupId}` },
  ];
}

export function useSummary(groupId: string) {
  const fn = useCallback(() => getSummary(groupId), [groupId]);
  return useQuery(fn, [groupId], fundWatch(groupId));
}

/** Member-safe aggregate fund snapshot (any role) — the Fund tile. */
export function useFundSummary(groupId: string) {
  const fn = useCallback(() => getFundSummary(groupId), [groupId]);
  return useQuery(fn, [groupId], fundWatch(groupId));
}

/** Group-wide totals, no per-entry rows or names (any role) — the member's group ledger. */
export function useFundTotals(groupId: string) {
  const fn = useCallback(() => getFundTotals(groupId), [groupId]);
  return useQuery(fn, [groupId], { table: 'ledger_entries', filter: `group_id=eq.${groupId}` });
}

/** GROUP-WIDE ledger (officers only) — every posting in the group, by name. */
export function useFundLedger(groupId: string, filters: LedgerFilters = {}) {
  const fn = useCallback(() => getFundLedger(groupId, filters), [groupId, filters.entry_type, filters.limit]);
  return useQuery(fn, [groupId, filters.entry_type, filters.limit], { table: 'ledger_entries', filter: `group_id=eq.${groupId}` });
}

export function useMemberBalances(groupId: string) {
  const fn = useCallback(() => getMemberBalances(groupId), [groupId]);
  return useQuery(fn, [groupId], { table: 'ledger_entries', filter: `group_id=eq.${groupId}` });
}

export function useMyBalance(groupId: string) {
  const fn = useCallback(() => getMyBalance(groupId), [groupId]);
  return useQuery(fn, [groupId], fundWatch(groupId));
}

export function useLedger(groupId: string, filters: LedgerFilters = {}) {
  const fn = useCallback(
    () => getLedger(groupId, filters),
    [groupId, filters.membership_id, filters.entry_type, filters.limit],
  );
  return useQuery(
    fn,
    [groupId, filters.membership_id, filters.entry_type, filters.limit],
    { table: 'ledger_entries', filter: `group_id=eq.${groupId}` },
  );
}