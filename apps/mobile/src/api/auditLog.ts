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
}

export interface AuditLogFilters extends Record<string, string | number | undefined> {
  category?: AuditCategory | 'all';
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

/** What a posting "is" for flag/ask-proof — matches audit_log.entity_type for the real modules that carry proof. */
export type ProofEntityType = 'contribution' | 'expense' | 'loan_payment';

export interface FlagPostingInput {
  entity_type: ProofEntityType;
  entity_id: string;
  /** Optional note explaining the concern — goes to the Owner. */
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
