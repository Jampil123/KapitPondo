/**
 * api/findings.ts
 * ----------------------------------------------------------------------------
 * Audit findings (migration 0067): the Auditor submits one, the Organizer
 * resolves or dismisses it. Auditor + Organizer only.
 */
import { api } from './client';
import type { FlaggableEntityType } from './auditLog';

export type FindingSeverity = 'low' | 'medium' | 'high';
export type FindingStatus = 'open' | 'resolved' | 'dismissed';

export interface AuditFinding {
  id: string;
  group_id: string;
  seq: number;
  /** "AF-03" */
  ref: string;
  /** Flags this finding covers (migration 0071). */
  flag_ids: string[];
  raised_by: string;
  title: string;
  details: string | null;
  /** What the Auditor suggests doing next (migration 0073). */
  recommendation: string | null;
  severity: FindingSeverity;
  entity_type: FlaggableEntityType | null;
  entity_id: string | null;
  status: FindingStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  raiser: { full_name: string } | null;
  resolver: { full_name: string } | null;
}

export interface SubmitFindingInput {
  title: string;
  details?: string;
  recommendation?: string;
  severity: FindingSeverity;
  entity_type?: FlaggableEntityType;
  entity_id?: string;
  /** Flags this finding writes up. */
  flag_ids?: string[];
}

/** GET — `status` 'open' or 'closed' (resolved + dismissed); omit for all. */
export async function listFindings(groupId: string, status?: 'open' | 'closed') {
  const res = await api.get<{ findings: AuditFinding[] }>(`/api/groups/${groupId}/findings`, status ? { status } : undefined);
  return res.findings;
}

/** POST — Auditor only. Notifies the Organizer. */
export function submitFinding(groupId: string, input: SubmitFindingInput) {
  return api.post<{ message: string; finding: AuditFinding }>(`/api/groups/${groupId}/findings`, input);
}

/** POST — Organizer only; a note is required to dismiss. */
export function closeFinding(groupId: string, findingId: string, status: 'resolved' | 'dismissed', note?: string) {
  return api.post<{ message: string; finding: AuditFinding }>(`/api/groups/${groupId}/findings/${findingId}/close`, { status, note });
}
