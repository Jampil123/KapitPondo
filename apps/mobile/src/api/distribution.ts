/**
 * api/distribution.ts
 * ----------------------------------------------------------------------------
 * Calls the distribution module of the API (M9) — the year-end close.
 *
 * Flow: set heads (owner) -> preview (owner/treasurer) -> VERIFY (auditor) ->
 * finalize (owner). Finalize is IMMUTABLE: it posts payout ledger entries,
 * drives the fund to 0, and the distribution can't be reopened. Finalize is
 * blocked with a 409 until an Auditor has verified the preview.
 *
 * Formula (server-side): capital is returned; net income = interest + penalties
 * − expenses; net income is shared BY HEADS. Outstanding debts are deducted per
 * member.
 *
 * Unverified members are paid out the same as everyone else — verification
 * gates privileges (creating groups, borrowing, officer roles), not
 * ownership of capital already contributed to the fund.
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type DistributionStatus = 'draft' | 'previewed' | 'verified' | 'finalized';

export interface Distribution {
  id: string;
  group_id: string;
  cycle_id: string | null;
  period: string; // e.g. "2026"
  total_amount: Money;
  rate: Money | null;
  status: DistributionStatus;
  declared_by: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  verified_by: string | null; // migration 0028
  verified_at: string | null; // migration 0028
  verify_notes: string | null; // migration 0028
  created_at: string;
}

/** Server joins membership + member name via `getAllocations` — see distributions.service.js. */
export interface DistributionAllocation {
  id: string;
  distribution_id: string;
  membership_id: string;
  amount: Money;
  ledger_entry_id: string | null; // set once finalized
  created_at: string;
  memberships: {
    member_id: string;
    heads: number;
    members: { full_name: string | null } | null;
  } | null;
}

export interface DistributionDetail {
  distribution: Distribution;
  allocations: DistributionAllocation[];
}

/** PATCH — set a member's head count (affects their share). Owner only. heads ≥ 1. */
export function setHeads(groupId: string, membershipId: string, heads: number) {
  return api.patch<{ membership: unknown }>(
    `/api/groups/${groupId}/memberships/${membershipId}/heads`,
    { heads },
  );
}

/** POST — build a year-end preview (status: previewed) + allocations. */
export function previewDistribution(groupId: string, period: string) {
  return api.post<DistributionDetail>(`/api/groups/${groupId}/distributions/preview`, { period });
}

/** POST — Auditor verifies a previewed distribution; proceeds to the Owner for finalization. */
export function verifyDistribution(groupId: string, id: string, notes?: string) {
  return api.post<{ message: string; distribution: Distribution }>(
    `/api/groups/${groupId}/distributions/${id}/verify`,
    { notes },
  );
}

/** GET — list all distributions for the group. */
export async function listDistributions(groupId: string) {
  const res = await api.get<{ distributions: Distribution[] }>(
    `/api/groups/${groupId}/distributions`,
  );
  return res.distributions;
}

/** GET — one distribution + its per-member allocations. */
export function getDistribution(groupId: string, id: string) {
  return api.get<DistributionDetail>(`/api/groups/${groupId}/distributions/${id}`);
}

/**
 * POST — finalize a previewed distribution (owner). Posts payouts, fund -> 0,
 * becomes immutable. Throws ApiError with status 409 if the fund changed since
 * the preview was built — in that case, re-run the preview before finalizing.
 */
export function finalizeDistribution(groupId: string, id: string) {
  return api.post<DistributionDetail>(`/api/groups/${groupId}/distributions/${id}/finalize`);
}

/** DELETE — cancel a previewed distribution so it can be re-run. */
export function cancelDistribution(groupId: string, id: string) {
  return api.del<{ ok: true }>(`/api/groups/${groupId}/distributions/${id}`);
}