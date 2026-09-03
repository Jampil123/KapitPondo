import { api } from './client';
import type { Money } from '../lib/money';

export type ContributionStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'late';
export type PaymentMethod = 'paymongo' | 'gcash' | 'cash' | 'bank_transfer' | 'other';

export interface Contribution {
  id: string;
  membership_id: string;
  cycle_id: string;
  group_id: string;
  amount: Money;
  due_date: string | null;
  paid_date: string | null;
  is_late: boolean;
  status: ContributionStatus;
  payment_method: PaymentMethod | null;
  proof_url: string | null;
  /** Short-lived viewable URL for proof_url (private storage path) — regenerated on every fetch. */
  proof_signed_url: string | null;
  external_reference: string | null;
  created_at: string;
  /** Bumped by rejectContribution() — the only timestamp we have for "when was this returned". */
  updated_at: string;
  /** Set by rejectContribution(); the API already selects '*', this type just didn't list it. */
  rejection_reason: string | null;
  /** Who recorded this — the submitting member for a self-submission, or the officer for a walk-in. Null-safe: real column, wasn't listed before. */
  recorded_by: string | null;
  /** True when an officer recorded this on a member's behalf (TC-018) rather than the member submitting it themselves. Still goes through the same submitted → different-officer-approves flow; the app just shows it in a separate "Awaiting Auditor" tab. */
  is_walk_in: boolean;
  /** Who recorded this, by name — the payer for a self-submission, an officer for a walk-in. */
  recorder: { full_name: string } | null;
  /** Who approved this contribution — null until an officer confirms it. */
  approver: { full_name: string } | null;
  /** The payer's membership + name, joined server-side (listContributions only). */
  memberships: { member_id: string; heads: number; members: { full_name: string | null } | null } | null;
}

export interface SubmitContributionInput {
  cycle_id: string;
  amount: string; // send a clean decimal string from toAmountString()
  payment_method?: PaymentMethod;
  proof_url?: string;
  external_reference?: string;
  /** Officers only — record a walk-in payment on this member's behalf (TC-018). Still goes to 'submitted', awaiting approval from a DIFFERENT officer — segregation of duties applies the same as a member's own claim. */
  membership_id?: string;
}

export interface ContributionFilters extends Record<string, string | undefined> {
  status?: ContributionStatus;
  cycle_id?: string;
  membership_id?: string; // officers only
}

/** POST — submit a contribution claim (status: submitted). */
export function submitContribution(groupId: string, input: SubmitContributionInput) {
  return api.post<{ contribution: Contribution }>(`/api/groups/${groupId}/contributions`, input);
}

/** GET — list contributions. Members see only their own; officers see all. */
export async function listContributions(groupId: string, filters: ContributionFilters = {}) {
  const res = await api.get<{ contributions: Contribution[] }>(
    `/api/groups/${groupId}/contributions`,
    filters,
  );
  return res.contributions;
}

/**
 * POST — approve a contribution. Posts a ledger entry via the approve_contribution
 * RPC. Throws ApiError if the caller recorded it (segregation of duties).
 */
export function approveContribution(groupId: string, contributionId: string) {
  return api.post<{ contribution: Contribution; ledger_entry?: unknown }>(
    `/api/groups/${groupId}/contributions/${contributionId}/approve`,
  );
}

/** POST — reject a contribution (status: rejected). */
export function rejectContribution(groupId: string, contributionId: string, reason?: string) {
  return api.post<{ contribution: Contribution }>(
    `/api/groups/${groupId}/contributions/${contributionId}/reject`,
    reason ? { reason } : undefined,
  );
}