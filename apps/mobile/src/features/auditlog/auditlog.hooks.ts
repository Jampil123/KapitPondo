/**
 * features/auditlog/auditlog.hooks.ts
 * ----------------------------------------------------------------------------
 *   const { data: entries, loading } = useAuditLog(groupId, { category, search });
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import { listAuditLog, exportAuditLog, flagPosting, askForProof, type AuditLogFilters, type FlagPostingInput, type AskForProofInput } from '../../api/auditLog';

export function useAuditLog(groupId: string, filters: AuditLogFilters = {}) {
  const fn = useCallback(
    () => listAuditLog(groupId, filters),
    // depend on primitive filter values, not object identity
    [groupId, filters.category, filters.kind, filters.search, filters.before, filters.limit],
  );
  return useQuery(
    fn,
    [groupId, filters.category, filters.kind, filters.search, filters.before, filters.limit],
    { table: 'audit_log', filter: `group_id=eq.${groupId}` },
  );
}

/** The whole trail since `from` (ISO) — for counts the paged list can't give, e.g. the Auditor's dashboard tiles. */
export function useAuditTrailSince(groupId: string, from: string) {
  const fn = useCallback(() => exportAuditLog(groupId, { from }), [groupId, from]);
  return useQuery(fn, [groupId, from], { table: 'audit_log', filter: `group_id=eq.${groupId}` });
}

/** Auditor flags a posting for the Owner — no ledger change. */
export function useFlagPosting(groupId: string) {
  return useAction((input: FlagPostingInput) => flagPosting(groupId, input));
}

/** Auditor asks the recorder of a proof-less posting to supply one. */
export function useAskForProof(groupId: string) {
  return useAction((input: AskForProofInput) => askForProof(groupId, input));
}
