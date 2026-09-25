/**
 * api/loanAudits.ts
 * ----------------------------------------------------------------------------
 * Loan decision audits (read-only, Auditor + Organizer): every approved loan
 * with the group's lending rules re-run against the records as they stood at
 * approval. See services/api/src/modules/loanAudits.
 */
import { api } from './client';
import type { Money } from '../lib/money';
import type { AuditLogEntry } from './auditLog';

export type LoanCheckKey = 'verified' | 'member' | 'penalties' | 'open_loan' | 'minimum' | 'cash' | 'decider' | 'within_request';

export interface LoanCheck {
  key: LoanCheckKey;
  label: string;
  passed: boolean;
  detail: string;
}

export interface LoanAudit {
  loan_id: string;
  /** "LN-0151" */
  ref: string;
  borrower: string | null;
  head_no: number;
  head_name: string | null;
  purpose: string | null;
  principal: Money;
  approved_principal: Money | null;
  interest_rate: Money | null;
  term_months: number;
  status: string;
  approved_at: string;
  approver: string | null;
  /** Role the decider held when approving ('owner' | 'treasurer'). */
  decided_as: string | null;
  disbursed_at: string | null;
  disburser: string | null;
  /** "LE-1039" — the ledger posting that released the money. */
  released_entry_ref: string | null;
  partial: boolean;
  failed: number;
  checks: LoanCheck[];
}

export interface LoanAuditDetail extends LoanAudit {
  history: AuditLogEntry[];
}

/** "LN-0147" — same format as the loan-audits API. */
export function loanRef(loanNo: number) {
  return `LN-${String(loanNo).padStart(4, '0')}`;
}

export async function listLoanAudits(groupId: string) {
  const res = await api.get<{ audits: LoanAudit[] }>(`/api/groups/${groupId}/loan-audits`);
  return res.audits;
}

export function getLoanAudit(groupId: string, loanId: string) {
  return api.get<LoanAuditDetail>(`/api/groups/${groupId}/loan-audits/${loanId}`);
}
