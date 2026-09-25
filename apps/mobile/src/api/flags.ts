/**
 * api/flags.ts
 * ----------------------------------------------------------------------------
 * Audit flags (migration 0070): the Auditor flags one record with a short
 * reason (raised through auditLog.flagPosting), the Organizer resolves or
 * dismisses it. Auditor + Organizer only. Each flag comes with a summary of
 * the record it points at.
 */
import { api } from './client';
import type { Money } from '../lib/money';
import type { AuditLogEntry, FlaggableEntityType } from './auditLog';

export type FlagStatus = 'open' | 'resolved' | 'dismissed';

export interface FlaggedRecord {
  /** "Contribution", "Loan repayment", "Loan release", "Loan"... */
  kind: string;
  /** Whose record it is (payer / borrower). */
  name: string | null;
  amount: Money | null;
  status: string | null;
  posted_at: string | null;
  channel: string | null;
  reference: string | null;
  /** Contribution/repayment: who recorded it. Loan: who approved it. */
  recorded_by: string | null;
  /** Contribution/repayment: who verified it. Loan: who released it. */
  verified_by: string | null;
  /** Repayments and loans: the loan's number (LN via loanRef). */
  loan_no?: number | null;
  /** The ledger posting this record produced (LE number via entryRef), once posted. */
  entry_no?: number | null;
  /** Repayments only: how the amount splits. */
  principal?: Money | null;
  interest?: Money | null;
}

export interface AuditFlag {
  id: string;
  group_id: string;
  seq: number;
  /** "FL-07" */
  ref: string;
  raised_by: string;
  entity_type: FlaggableEntityType;
  entity_id: string;
  reason: string;
  note: string | null;
  status: FlagStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  raiser: { full_name: string } | null;
  resolver: { full_name: string } | null;
  record: FlaggedRecord;
}

/** GET — `status` 'open' or 'closed' (resolved + dismissed); omit for all. */
export async function listFlags(groupId: string, status?: 'open' | 'closed') {
  const res = await api.get<{ flags: AuditFlag[] }>(`/api/groups/${groupId}/flags`, status ? { status } : undefined);
  return res.flags;
}

/** GET — one flag, its record, and the audit trail on that record (oldest first). */
export function getFlag(groupId: string, flagId: string) {
  return api.get<{ flag: AuditFlag; history: AuditLogEntry[] }>(`/api/groups/${groupId}/flags/${flagId}`);
}

/** POST — Organizer only; a note is required to dismiss. */
export function closeFlag(groupId: string, flagId: string, status: 'resolved' | 'dismissed', note?: string) {
  return api.post<{ message: string; flag: AuditFlag }>(`/api/groups/${groupId}/flags/${flagId}/close`, { status, note });
}
