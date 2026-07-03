/**
 * api/cycles.ts
 * ----------------------------------------------------------------------------
 * Calls the cycles module of the API (M4). A cycle is a group's contribution
 * period; contributions attach to the ACTIVE cycle.
 *
 * Lifecycle: create (draft) -> activate (active) -> close (closed).
 * The DB enforces one active cycle per group via a partial unique index, so
 * activating a second one fails — surface that error to the user.
 */
import { api } from './client';
import type { Money } from '../lib/money';

export type CycleStatus = 'draft' | 'active' | 'closed';
export type Frequency = 'monthly' | 'weekly' | 'biweekly' | 'quarterly';
export type PenaltyType = 'fixed' | 'percent';

export interface Cycle {
  id: string;
  group_id: string;
  name: string;
  contribution_amount: Money;
  frequency: Frequency;
  penalty_amount: Money | null;
  penalty_type: PenaltyType | null;
  start_date: string;
  end_date: string | null;
  status: CycleStatus;
}

export interface CreateCycleInput {
  name: string;
  contribution_amount: string; // clean decimal string from toAmountString()
  start_date: string; // ISO date
  frequency?: Frequency; // default: monthly
  penalty_amount?: string;
  penalty_type?: PenaltyType; // default: fixed
  end_date?: string;
}

/** GET — all cycles for the group, newest first. */
export async function listCycles(groupId: string) {
  const res = await api.get<{ cycles: Cycle[] }>(`/api/groups/${groupId}/cycles`);
  return res.cycles;
}

/** POST — create a cycle (status: draft). Owner/treasurer. */
export function createCycle(groupId: string, input: CreateCycleInput) {
  return api.post<{ cycle: Cycle }>(`/api/groups/${groupId}/cycles`, input);
}

/**
 * POST — activate a draft cycle. Throws ApiError if the group already has an
 * active cycle (DB partial unique index, SQLSTATE 23505).
 */
export function activateCycle(groupId: string, cycleId: string) {
  return api.post<{ cycle: Cycle }>(`/api/groups/${groupId}/cycles/${cycleId}/activate`);
}

/** POST — close an active cycle (runs the close_cycle RPC). */
export function closeCycle(groupId: string, cycleId: string) {
  return api.post<{ cycle: Cycle }>(`/api/groups/${groupId}/cycles/${cycleId}/close`);
}

/** Pure selector: the group's single active cycle, or null. */
export function selectActiveCycle(cycles: Cycle[]): Cycle | null {
  return cycles.find((c) => c.status === 'active') ?? null;
}

export interface CycleProgress {
  expected_total: Money;
  collected_total: Money;
  percent_collected: number;
}

/** GET — expected vs collected contributions for a cycle. */
export async function getCycleProgress(groupId: string, cycleId: string) {
  const res = await api.get<{ progress: CycleProgress }>(`/api/groups/${groupId}/cycles/${cycleId}/progress`);
  return res.progress;
}