/**
 * api/ledger.ts
 * ----------------------------------------------------------------------------
 * The ledger types + the manual ledger operations (M7).
 *
 * The ledger is append-only (UPDATE/DELETE blocked by DB triggers), so nothing
 * is ever edited or deleted — corrections are made by posting an OPPOSING entry.
 *
 *  - reversal requests: a 3-step chain — Treasurer/Owner initiates (reason
 *    required, nothing posted yet) -> Auditor verifies or rejects -> Owner
 *    finalizes, which is the only step that actually posts the reversing
 *    entry.
 *  - adjustment: posts a manual credit/debit with a reason (owner/treasurer),
 *    immediately — this bypasses the proof+approval cycle every other
 *    financial event goes through, so treat it as a break-glass tool and
 *    surface the `reason` prominently in the UI.
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type LedgerDirection = 'credit' | 'debit';

export type LedgerEntryType =
  | 'contribution'
  | 'loan_disbursement'
  | 'loan_repayment'
  | 'distribution'
  | 'expense'
  | 'penalty'
  | 'fee'
  | 'adjustment'
  | 'reversal';

export interface LedgerEntry {
  id: string;
  group_id: string;
  membership_id: string | null;
  cycle_id: string | null;
  entry_type: LedgerEntryType;
  direction: LedgerDirection;
  amount: Money;
  source_type: string | null;
  source_id: string | null;
  description: string | null;
  posted_at: string;
  posted_by: string;
  /** The officer who posted this entry (always the approver — see the SQL RPCs). */
  poster: { full_name: string } | null;
}

export type ReversalRequestStatus = 'pending_verification' | 'verified' | 'rejected' | 'finalized';

export interface ReversalRequest {
  id: string;
  group_id: string;
  entry_id: string;
  entry?: LedgerEntry;
  reason: string;
  status: ReversalRequestStatus;
  initiated_by: string;
  initiated_at: string;
  verified_by: string | null;
  verified_at: string | null;
  verify_notes: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  reversal_entry_id: string | null;
}

/**
 * POST — initiate a reversal request (Treasurer or Owner). `reason` is
 * required. Does NOT post anything to the ledger yet — see verify/finalize
 * below. Throws ApiError 409 if the entry already has an active/completed
 * reversal request.
 */
export function initiateReversal(groupId: string, entryId: string, reason: string) {
  return api.post<{ message: string; request: ReversalRequest }>(
    `/api/groups/${groupId}/ledger/${entryId}/reverse`,
    { reason },
  );
}

/** GET — list reversal requests (officers). */
export async function listReversalRequests(groupId: string, status?: ReversalRequestStatus) {
  const res = await api.get<{ requests: ReversalRequest[] }>(`/api/groups/${groupId}/reversal-requests`, { status });
  return res.requests;
}

/** POST — Auditor verifies a pending request; proceeds to the Owner for final approval. */
export function verifyReversal(groupId: string, requestId: string, notes?: string) {
  return api.post<{ message: string; request: ReversalRequest }>(
    `/api/groups/${groupId}/reversal-requests/${requestId}/verify`,
    { notes },
  );
}

/** POST — Auditor rejects a pending request (e.g. a discrepancy found). */
export function rejectReversal(groupId: string, requestId: string, notes?: string) {
  return api.post<{ message: string; request: ReversalRequest }>(
    `/api/groups/${groupId}/reversal-requests/${requestId}/reject`,
    { notes },
  );
}

/** POST — Owner finalizes a verified request. This is the step that actually posts the reversing ledger entry. */
export function finalizeReversal(groupId: string, requestId: string) {
  return api.post<{ message: string; request: ReversalRequest; reversalEntry: LedgerEntry }>(
    `/api/groups/${groupId}/reversal-requests/${requestId}/finalize`,
  );
}

export interface AdjustmentInput {
  direction: LedgerDirection;
  amount: string; // clean decimal string
  reason: string;
  membership_id?: string; // omit for a fund-level adjustment
}

/** POST — post a manual adjustment (owner/treasurer). */
export function postAdjustment(groupId: string, input: AdjustmentInput) {
  return api.post<{ entry: LedgerEntry }>(`/api/groups/${groupId}/ledger/adjustment`, input);
}
