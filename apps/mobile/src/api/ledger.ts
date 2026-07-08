/**
 * api/ledger.ts
 * ----------------------------------------------------------------------------
 * The ledger types + the two manual ledger operations (M7).
 *
 * The ledger is append-only (UPDATE/DELETE blocked by DB triggers), so nothing
 * is ever edited or deleted — corrections are made by posting an OPPOSING entry.
 *
 *  - reverse: posts a reversing entry linked to the original (owner only).
 *  - adjustment: posts a manual credit/debit with a reason (owner/treasurer).
 *
 * SPEC NOTES:
 *  - Spec §1.1/M7.4 wanted reversal as a 3-step chain (treasurer initiates ->
 *    auditor verifies -> owner approves). The live API makes it a single owner
 *    action. Documented divergence.
 *  - adjustment bypasses the proof+approval cycle that §0.2 requires of every
 *    financial event — treat it as a break-glass tool and surface the `reason`
 *    prominently in the UI.
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

/**
 * POST — reverse a ledger entry (owner). Creates an opposing entry. `reason` is
 * required. Throws ApiError 409 if the entry was already reversed.
 */
export function reverseLedgerEntry(groupId: string, entryId: string, reason: string) {
  return api.post<{ reversal: LedgerEntry }>(
    `/api/groups/${groupId}/ledger/${entryId}/reverse`,
    { reason },
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