/**
 * api/penalties.ts
 * ----------------------------------------------------------------------------
 * Calls the penalties module of the API (M5.4 — late-contribution penalties,
 * TC-039/TC-017). Detection is lazy — no cron in this stack; any officer
 * viewing contributions or cycle progress triggers checkLatePenalties()
 * server-side (see services/api's contributions/cycles routes), so a new
 * penalty just appears here rather than needing to be manually run. This
 * module is the read/waive side for the Penalties Review screen.
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type PenaltyStatus = 'pending' | 'waived' | 'paid';

export interface Penalty {
  id: string;
  group_id: string;
  membership_id: string;
  cycle_id: string | null;
  contribution_id: string | null;
  amount: Money;
  reason: string;
  status: PenaltyStatus;
  waived_by: string | null;
  waived_at: string | null;
  waive_reason: string | null;
  ledger_entry_id: string | null; // set only once actually paid — not reachable yet, no "pay" flow exists
  created_at: string;
  /** Who the penalty belongs to. */
  membership: { member_id: string; members: { full_name: string } | null } | null;
}

/** GET — list penalties for a group (officers). Optional status filter. */
export async function listPenalties(groupId: string, status?: PenaltyStatus) {
  const res = await api.get<{ penalties: Penalty[] }>(`/api/groups/${groupId}/penalties`, status ? { status } : undefined);
  return res.penalties;
}

/** GET — member-safe: my own penalties only. Optional status filter (e.g. 'pending' for what's still unsettled). */
export async function listMyPenalties(groupId: string, status?: PenaltyStatus) {
  const res = await api.get<{ penalties: Penalty[] }>(`/api/groups/${groupId}/penalties/mine`, status ? { status } : undefined);
  return res.penalties;
}

/** POST — waive a pending penalty, with a required reason (Owner only) — TC-017. */
export function waivePenalty(groupId: string, penaltyId: string, reason: string) {
  return api.post<{ message: string; penalty: Penalty }>(
    `/api/groups/${groupId}/penalties/${penaltyId}/waive`,
    { reason },
  );
}
