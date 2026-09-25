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
import type { AuditLogEntry, FlaggableEntityType } from './auditLog';
import type { FlaggedRecord } from './flags';

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
  /** Per-group posting number (migration 0072) — shown as LE-1043 via entryRef(). */
  entry_no?: number;
  /** Set on a reversing entry: the entry it cancels. */
  reverses_entry_id?: string | null;
  /** The officer who posted this entry (always the approver — see the SQL RPCs). */
  poster: { full_name: string } | null;
  /** Who the entry actually belongs to (the contributor/borrower) — null for group-level entries (e.g. expenses). */
  membership: { member_id: string; members: { full_name: string; avatar_url?: string | null } | null } | null;
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

/** "LE-1043" — entry numbers start at 1 per group and display from 1001. */
export function entryRef(e: { entry_no?: number | null }) {
  return e.entry_no ? `LE-${1000 + e.entry_no}` : 'Entry';
}

export interface LedgerEntryDetail {
  entry: LedgerEntry;
  /** What a flag on this entry points at (the record behind it); null for entries with no source record. */
  entity_type: FlaggableEntityType | null;
  /** The record behind the entry (for older repayment entries, the payment rather than the loan). */
  source_id: string | null;
  record: FlaggedRecord | null;
  reversed_by: { id: string; entry_no: number; posted_at: string } | null;
  history: AuditLogEntry[];
}

/** GET — one posting with its record, reversal and audit trail (officers only). */
export function getLedgerEntryDetail(groupId: string, entryId: string) {
  return api.get<LedgerEntryDetail>(`/api/groups/${groupId}/ledger/entries/${entryId}`);
}
