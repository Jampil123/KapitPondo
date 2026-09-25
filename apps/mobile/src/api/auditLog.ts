/**
 * api/auditLog.ts
 * ----------------------------------------------------------------------------
 * The Auditor's audit trail (migration 0047 wired this up for real — see the
 * comment on that migration and lib/auditLog.js server-side). One row per
 * governance/money decision: who, what role they held at the time, the
 * before/after state, and when. Auditor + Owner only.
 */
import { api } from './client';

export type AuditCategory = 'money' | 'governance' | 'reversals' | 'settings';

export interface AuditLogEntry {
  id: string;
  group_id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  category: AuditCategory;
  actor: { full_name: string | null } | null;
  /** What the row is about, in the app's words (server-side, lib/auditSubjects.js). */
  subject?: AuditSubject | null;
}

export interface AuditSubject {
  /** Whose record: payer, borrower... */
  name: string | null;
  /** "LE-1043" — the posting this record produced. */
  entry_ref: string | null;
  /** "LN-0147" */
  loan_ref: string | null;
  /** Reversal requests: the reversing posting, once finalized. */
  reversing_entry_ref: string | null;
  /** Flags / findings: "FL-07", "AF-03". */
  ref: string | null;
}

/** Audit trail filter chips — groups of actions (see KINDS in auditlog.service.js). */
export type AuditKind = 'recorded' | 'verifications' | 'flags' | 'reversals';

export interface AuditLogFilters extends Record<string, string | number | undefined> {
  category?: AuditCategory | 'all';
  kind?: AuditKind;
  search?: string;
  /** ISO timestamp — entries strictly before this, for "load older" pagination. */
  before?: string;
  limit?: number;
}

/** GET — the group's audit trail (Auditor/Owner only). */
export async function listAuditLog(groupId: string, filters: AuditLogFilters = {}) {
  const res = await api.get<{ entries: AuditLogEntry[] }>(`/api/groups/${groupId}/audit-log`, filters);
  return res.entries;
}

/** GET — the whole trail for a date range (ISO, both optional) for the exported audit report; `truncated` when it hit the server cap. */
export function exportAuditLog(groupId: string, range: { from?: string; to?: string } = {}) {
  return api.get<{ entries: AuditLogEntry[]; truncated: boolean }>(`/api/groups/${groupId}/audit-log/export`, range);
}

/** What a posting "is" for flag/ask-proof — matches audit_log.entity_type for the real modules that carry proof. */
export type ProofEntityType = 'contribution' | 'expense' | 'loan_payment';

/** Anything the Auditor can flag: proof-carrying postings, plus loans (application or release) and reversal requests. */
export type FlaggableEntityType = ProofEntityType | 'loan' | 'loan_disbursement' | 'reversal_request';

export interface FlagPostingInput {
  entity_type: FlaggableEntityType;
  entity_id: string;
  /** Short headline, e.g. "Amount doesn't match proof" — becomes the flag's title. */
  reason?: string;
  /** Optional detail explaining the concern — goes to the Owner. */
  note?: string;
  /** Short human-readable description (e.g. "Contribution · Ana Reyes · ₱4,500") for the Owner's notification. */
  label?: string;
}

/** POST — Auditor flags a posting as a concern for the Owner. Does not touch the ledger. */
export function flagPosting(groupId: string, input: FlagPostingInput) {
  return api.post<{ message: string }>(`/api/groups/${groupId}/audit-log/flag`, input);
}

export interface AskForProofInput {
  entity_type: ProofEntityType;
  entity_id: string;
  /** member id of whoever recorded the posting — who gets notified. */
  recorded_by: string;
  label?: string;
}

/** POST — Auditor asks the recorder of a proof-less posting to supply one. */
export function askForProof(groupId: string, input: AskForProofInput) {
  return api.post<{ message: string }>(`/api/groups/${groupId}/audit-log/ask-proof`, input);
}
