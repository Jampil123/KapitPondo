/**
 * api/groups.ts
 * ----------------------------------------------------------------------------
 * Groups module (M2/M3). Response shape CONFIRMED against the live API:
 * GET /groups returns { groups: [{ role, status, groups: {…} }] } — the group
 * object is NESTED under `groups`, with role + membership status as siblings.
 */
import { api } from './client';
import type { GroupRole } from '../constants/roles';

export type GroupStatus = 'active' | 'archived';
export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'exited';

export interface Group {
  id: string;
  name: string;
  fund_code: string;
  description: string | null;
  status: GroupStatus;
}

/** A membership row from GET /groups: my role + status + the nested group. */
export interface MyGroup {
  role: GroupRole;
  status: MembershipStatus;
  groups: Group;
}

/** GET /api/groups — every membership for the caller (active or pending). */
export async function listMyGroups() {
  const res = await api.get<{ groups: MyGroup[] }>('/api/groups');
  return res.groups ?? [];
}

/** POST /api/groups — create a group; caller becomes owner. Returns { group }. */
export function createGroup(input: { name: string; fund_code: string; description?: string | null }) {
  return api.post<{ group: Group }>('/api/groups', input);
}

/** POST /api/groups/join-by-code — request to join; creates a PENDING membership. */
export function joinByCode(fund_code: string) {
  return api.post<{ membership?: unknown; group?: Group }>('/api/groups/join-by-code', { fund_code });
}

// --- Member management (officer) — paths per the API reference ---------------
export async function listPendingMembers(groupId: string) {
  const res = await api.get<{ members: unknown[] }>(`/api/groups/${groupId}/members/pending`);
  return res.members ?? [];
}
export async function listMembers(groupId: string) {
  const res = await api.get<{ members: unknown[] }>(`/api/groups/${groupId}/members`);
  return res.members ?? [];
}
export function approveMember(groupId: string, memberId: string) {
  return api.patch(`/api/groups/${groupId}/members/${memberId}/approve`);
}
export function rejectMember(groupId: string, memberId: string) {
  return api.patch(`/api/groups/${groupId}/members/${memberId}/reject`);
}
export function setMemberRole(groupId: string, memberId: string, role: GroupRole) {
  return api.patch(`/api/groups/${groupId}/members/${memberId}/role`, { role });
}
export function removeMember(groupId: string, memberId: string) {
  return api.del(`/api/groups/${groupId}/members/${memberId}`);
}