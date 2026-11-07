/**
 * api/distribution.ts
 * ----------------------------------------------------------------------------
 * Calls the distribution module of the API (M9) — the year-end close.
 *
 * Flow: Treasurer prepares a draft -> submits it (previewed) -> VERIFY (auditor) ->
 * finalize (owner). Finalize is IMMUTABLE: it posts payout ledger entries,
 * drives the fund to 0, and the distribution can't be reopened. Finalize is
 * blocked with a 409 until an Auditor has verified the preview.
 *
 * Formula (server-side, migration 0074): payout = capital + share of net income
 * − unpaid loan − unpaid penalties. Net income is shared BY HEADS at the time of
 * the preview; the deducted loans and penalties are settled when it's finalized.
 *
 * Unverified members are paid out the same as everyone else — verification
 * gates privileges (creating groups, borrowing, officer roles), not
 * ownership of capital already contributed to the fund.
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type DistributionStatus = 'draft' | 'previewed' | 'verified' | 'returned' | 'finalized';

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
  // migration 0074 — null on previews made with the old formula
  capital_total: Money | null;
  net_income: Money | null;
  interest_income: Money | null;
  penalty_income: Money | null;
  deductions_total: Money | null;
  total_heads: number | null;
  submitted_by: string | null;
  submitted_at: string | null;
  // migration 0075 — set when the Auditor returns it
  returned_by: string | null;
  returned_at: string | null;
  return_reason: string | null;
}

/** One preview figure next to the ledger's (UC-YD-02 steps 2-3, E1). */
export interface LedgerCheckRow {
  kind: 'total' | 'member';
  item: 'capital' | 'net_income' | 'deductions' | 'payout';
  label: string;
  membership_id: string | null;
  preview_amount: Money;
  ledger_amount: Money;
  differs?: boolean; // totals only
}

export interface LedgerCheck {
  totals: LedgerCheckRow[];
  /** Only the members whose figures moved since the preview. */
  members: LedgerCheckRow[];
  matches: boolean;
}

/** Live estimate of the split before anything is prepared (nothing saved). */
export interface DistributionEstimate {
  totals: {
    capital_total: Money; net_income: Money; interest_income: Money; penalty_income: Money;
    deductions_total: Money; total_heads: number; total_amount: Money;
  };
  members: {
    membership_id: string; heads: number; capital: Money; share: Money;
    loan_owed: Money; penalties: Money; payout: Money;
    member: { full_name: string | null; avatar_url?: string | null } | null;
  }[];
}

/** GET — officers. */
export function getDistributionEstimate(groupId: string) {
  return api.get<DistributionEstimate>(`/api/groups/${groupId}/distributions/estimate`);
}

/** GET — officers. The preview's figures next to what the ledger says now. */
export function getLedgerCheck(groupId: string, id: string) {
  return api.get<LedgerCheck>(`/api/groups/${groupId}/distributions/${id}/ledger-check`);
}

/** What stops the Treasurer from preparing (UC-YD-01 E1/E2/A3). */
export interface DistributionBlocker {
  kind: string;
  label: string;
  item_count: number;
}

/** Server joins membership + member name via `getAllocations` — see distributions.service.js. */
export interface DistributionAllocation {
  id: string;
  distribution_id: string;
  membership_id: string;
  amount: Money; // the payout
  heads: number | null;
  capital: Money | null;
  share: Money | null;
  loan_deduction: Money | null;
  penalty_deduction: Money | null;
  ledger_entry_id: string | null; // set once finalized
  created_at: string;
  memberships: {
    member_id: string;
    heads: number;
    members: { full_name: string | null; avatar_url?: string | null } | null;
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

export interface HeadName { head_no: number; name: string }

/** GET — names given to a membership's extra heads (2..n). Head 1 is the member themselves. */
export async function getHeadNames(groupId: string, membershipId: string) {
  const res = await api.get<{ names: HeadName[] }>(`/api/groups/${groupId}/memberships/${membershipId}/head-names`);
  return res.names;
}

/** PUT — name your own extra heads. `{ 2: 'Pedro', 3: '' }` — a blank clears it. */
export async function setHeadNames(groupId: string, membershipId: string, names: Record<number, string>) {
  const res = await api.put<{ names: HeadName[] }>(`/api/groups/${groupId}/memberships/${membershipId}/head-names`, { names });
  return res.names;
}

/** GET — what stops the Treasurer from preparing right now. Empty = ready. */
export async function getDistributionReadiness(groupId: string) {
  const res = await api.get<{ blockers: DistributionBlocker[] }>(`/api/groups/${groupId}/distributions/readiness`);
  return res.blockers ?? [];
}

/** POST — Treasurer prepares a draft for the active cycle (replaces any open draft or unverified preview). */
export function previewDistribution(groupId: string) {
  return api.post<DistributionDetail>(`/api/groups/${groupId}/distributions/preview`);
}

/** POST — Treasurer submits the draft for verification; the Auditor is notified. */
export function submitDistribution(groupId: string, id: string) {
  return api.post<{ distribution: Distribution }>(`/api/groups/${groupId}/distributions/${id}/submit`);
}

/** POST — Auditor verifies a previewed distribution; proceeds to the Owner for finalization. */
/** POST — the Auditor who verified takes it back before the Organizer finalizes; it returns to 'previewed'. */
export function unverifyDistribution(groupId: string, id: string) {
  return api.post<{ message: string; distribution: Distribution }>(`/api/groups/${groupId}/distributions/${id}/unverify`);
}

/** POST — the Auditor sends the preview back to the Treasurer with notes (even after verifying it, until finalized). It becomes 'returned'. */
export function returnDistribution(groupId: string, id: string, reason: string) {
  return api.post<{ message: string }>(`/api/groups/${groupId}/distributions/${id}/return`, { reason });
}

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

/** DELETE — discard a draft, or cancel an unverified preview so it can be re-run. */
export function cancelDistribution(groupId: string, id: string) {
  return api.del<{ ok: true }>(`/api/groups/${groupId}/distributions/${id}`);
}