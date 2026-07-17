/**
 * features/ledger/ledger.hooks.ts
 * ----------------------------------------------------------------------------
 * The ledger correction actions (M7). All sensitive — gate them tightly.
 *
 *   // Treasurer/Owner: initiate a reversal request (reason required)
 *   const { run: initiate, error } = useInitiateReversal(groupId);
 *   await initiate(entryId, 'Duplicate of #1234');   // error.status 409 if already reversed/pending
 *
 *   // Auditor: verify or reject a pending request
 *   const { run: verify } = useVerifyReversal(groupId);
 *   const { run: reject } = useRejectReversal(groupId);
 *
 *   // Owner: finalize a verified request — this is what actually posts the entry
 *   const { run: finalize } = useFinalizeReversal(groupId);
 *
 *   // Owner/treasurer: manual adjustment (break-glass; show the reason)
 *   const { run: adjust } = usePostAdjustment(groupId);
 *   await adjust({ direction: 'credit', amount: toAmountString(input)!, reason });
 */
import { useCallback } from 'react';
import { useQuery, useAction } from '../../hooks/useApi';
import {
  initiateReversal,
  listReversalRequests,
  verifyReversal,
  rejectReversal,
  finalizeReversal,
  postAdjustment,
  type AdjustmentInput,
  type ReversalRequestStatus,
} from '../../api/ledger';

export function useReversalRequests(groupId: string, status?: ReversalRequestStatus) {
  const fn = useCallback(() => listReversalRequests(groupId, status), [groupId, status]);
  return useQuery(fn, [groupId, status]);
}

export function useInitiateReversal(groupId: string) {
  return useAction((entryId: string, reason: string) => initiateReversal(groupId, entryId, reason));
}

export function useVerifyReversal(groupId: string) {
  return useAction((requestId: string, notes?: string) => verifyReversal(groupId, requestId, notes));
}

export function useRejectReversal(groupId: string) {
  return useAction((requestId: string, notes?: string) => rejectReversal(groupId, requestId, notes));
}

export function useFinalizeReversal(groupId: string) {
  return useAction((requestId: string) => finalizeReversal(groupId, requestId));
}

export function usePostAdjustment(groupId: string) {
  return useAction((input: AdjustmentInput) => postAdjustment(groupId, input));
}
