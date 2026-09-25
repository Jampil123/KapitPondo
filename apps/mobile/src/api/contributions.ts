import { api } from './client';
import type { Money } from '../lib/money';

/** 'confirmed' = money confirmed as received, waiting for the independent verification that posts it (migration 0075). */
/** The server's OCR reading of an uploaded proof (migration 0076). `read: false` = the photo couldn't be read. */
export interface ProofReading {
  amount: number | null;
  reference: string | null;
  /** "2026-09-24" */
  date: string | null;
  sender: string | null;
  read: boolean;
}

export type ContributionStatus = 'pending' | 'submitted' | 'confirmed' | 'approved' | 'rejected' | 'late';
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
  /** Late-penalty share of what the member paid, kept apart from `amount` (the contribution alone) — see migration 0068. */
  penalty_applied: Money;
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
  /** Step 1 of 2 (migration 0075): who confirmed the money arrived, and when. */
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  /** What the server read off the proof (0076); null until read. */
  proof_reading?: ProofReading | null;
  /** The payer's membership + name, joined server-side (listContributions only). */
  memberships: { member_id: string; heads: number; members: { full_name: string | null; avatar_url?: string | null } | null } | null;
  /** Set when a PayMongo webhook posted this automatically (see 0051_paymongo_contributions.sql) — no recorder/approver pair, the gateway's signed confirmation stands in for both. */
  auto_confirmed: boolean;
  gateway_provider: string | null;
  gateway_reference: string | null;
  gateway_status: string | null;
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

/** POST — step 1: the fund holder confirms the money arrived. Posts nothing. */
export function confirmContribution(groupId: string, contributionId: string) {
  return api.post<{ message: string; contribution: Contribution }>(`/api/groups/${groupId}/contributions/${contributionId}/confirm`);
}

/** POST — step 2: the independent check. This posts to the ledger. */
export function verifyContribution(groupId: string, contributionId: string) {
  return api.post<{ message: string; ledgerEntry: unknown }>(`/api/groups/${groupId}/contributions/${contributionId}/verify`);
}

/** POST — read (or re-read) the proof now, for records submitted before proofs were read automatically. */
export function readContributionProof(groupId: string, contributionId: string) {
  return api.post<{ reading: ProofReading | null }>(`/api/groups/${groupId}/contributions/${contributionId}/read-proof`);
}

/** POST — the member's "This isn't right" on a contribution recorded for them. Raises a flag for the Auditor. */
export function disputeContribution(groupId: string, contributionId: string, note?: string) {
  return api.post<{ message: string }>(`/api/groups/${groupId}/contributions/${contributionId}/dispute`, note ? { note } : undefined);
}

/** POST — reject a contribution (status: rejected). */
export function rejectContribution(groupId: string, contributionId: string, reason?: string) {
  return api.post<{ contribution: Contribution }>(
    `/api/groups/${groupId}/contributions/${contributionId}/reject`,
    reason ? { reason } : undefined,
  );
}

/** GET — advisory check: has this GCash reference already been used in this group? Non-blocking — shown as a flag, never stops submission. */
export async function checkDuplicateReference(groupId: string, ref: string) {
  const res = await api.get<{ duplicate: boolean }>(`/api/groups/${groupId}/contributions/check-reference`, { ref });
  return res.duplicate;
}