/**
 * api/reporting.ts
 * ----------------------------------------------------------------------------
 * Read-only reporting queries (M8). These power dashboards and the ledger feed.
 */
import { api } from './client';
import type { Money } from '../lib/money';
import type { LedgerEntry, LedgerEntryType } from './ledger';

/** Group financial summary (officers). Matches the group_summary SQL function. */
export interface GroupSummary {
  total_contributions: Money;
  total_loan_disbursements: Money;
  total_loan_repayments: Money;
  total_expenses: Money;
  total_distributions: Money;
  available_cash: Money;
  active_members: number;
  pending_loans: number;
}

/** Per-member balance row (officers). Matches reporting.service.js's memberBalances(). */
export interface MemberBalance {
  membership_id: string;
  full_name: string | null;
  role: string;
  heads: number;
  balance: Money;
}

/** The caller's own balance in this group. Shape — verify. */
export interface MyBalance {
  contributions: Money;
  loan_outstanding: Money;
  balance: Money;
}

export interface LedgerFilters extends Record<string, string | number | undefined> {
  membership_id?: string; // officers only
  entry_type?: LedgerEntryType;
  limit?: number;
}

/** GET — group financial summary (treasurer/auditor/owner). */
export async function getSummary(groupId: string) {
  const res = await api.get<{ summary: GroupSummary }>(`/api/groups/${groupId}/reports/summary`);
  return res.summary;
}

/** GET — per-member balances across the group (treasurer/auditor/owner). */
export async function getMemberBalances(groupId: string) {
  const res = await api.get<{ balances: MemberBalance[] }>(
    `/api/groups/${groupId}/reports/member-balances`,
  );
  return res.balances;
}

/** GET — ledger feed. Members see only their own entries; officers can filter. */
export async function getLedger(groupId: string, filters: LedgerFilters = {}) {
  // The route returns { ledger }, not { entries } — this key was wrong, so
  // every ledger fetch silently came back empty regardless of real data.
  const res = await api.get<{ ledger: LedgerEntry[] }>(
    `/api/groups/${groupId}/reports/ledger`,
    filters,
  );
  return res.ledger;
}

/** GET — member-safe aggregate fund snapshot (any role). Same fields as GroupSummary. */
export async function getFundSummary(groupId: string) {
  const res = await api.get<{ summary: GroupSummary }>(`/api/groups/${groupId}/reports/fund-summary`);
  return res.summary;
}

/** GET — the caller's own balance in this group (any role). */
export function getMyBalance(groupId: string) {
  return api.get<MyBalance>(`/api/groups/${groupId}/reports/my-balance`);
}