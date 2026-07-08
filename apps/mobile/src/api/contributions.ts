/**
 * api/contributions.ts
 * ----------------------------------------------------------------------------
 * Calls the contributions module of the API (M5). Screens use the hooks in
 * features/contributions, which wrap these.
 *
 * The money flow these enable:
 *   submit (member or treasurer) → approve (a DIFFERENT officer) → ledger posts.
 * The "different officer" rule is enforced by the server (recorder ≠ approver);
 * if it's violated, approve() throws an ApiError you can surface to the user.
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type ContributionStatus = 'pending' | 'submitted' | 'approved' | 'rejected';
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
  external_reference: string | null;
  created_at: string;
  /** Who approved this contribution — null until an officer confirms it. */
  approver: { full_name: string } | null;
}

export interface SubmitContributionInput {
  cycle_id: string;
  amount: string; // send a clean decimal string from toAmountString()
  payment_method?: PaymentMethod;
  proof_url?: string;
  external_reference?: string;
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