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
  owner: { full_name: string | null } | null;
}

/** A membership row from GET /groups: my role + status + the nested group. */
export interface MyGroup {
  id: string;
  role: GroupRole;
  status: MembershipStatus;
  heads: number;
  /** Null while status is still 'pending' — set the moment an owner approves. */
  joined_at: string | null;
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

/** A group's officer, name + role (+ a verified badge) — no email/phone — any active member can see this. */
export interface Officer {
  role: GroupRole;
  full_name: string | null;
  verified: boolean;
}

export interface OfficersResponse {
  officers: Officer[];
  member_count: number;
}

/** GET /api/groups/:groupId/officers — who runs the group (any active role). */
export function listOfficers(groupId: string) {
  return api.get<OfficersResponse>(`/api/groups/${groupId}/officers`);
}

/** A group member's name + role + heads (no email/phone) — any active member can see this. heads is included since it determines year-end profit share. */
export interface DirectoryEntry {
  member_id: string;
  role: GroupRole;
  heads: number;
  full_name: string | null;
}

/** GET /api/groups/:groupId/members/directory — every active member (any active role). */
export async function listMemberDirectory(groupId: string) {
  const res = await api.get<{ members: DirectoryEntry[] }>(`/api/groups/${groupId}/members/directory`);
  return res.members;
}

/** POST /api/groups/:groupId/leave — self-service: the caller leaves this group. Throws (409) if they're the Owner, or have an active loan / unresolved penalty. */
export function leaveGroup(groupId: string) {
  return api.post<{ ok: true }>(`/api/groups/${groupId}/leave`);
}

// --- Member management (officer) — paths per the API reference ---------------
export async function listPendingMembers(groupId: string) {
  const res = await api.get<{ members: unknown[] }>(`/api/groups/${groupId}/members/pending`);
  return res.members ?? [];
}

/** One row from GET /groups/:groupId/members (officer-only, full roster incl. heads). */
export interface GroupMember {
  id: string; // membership id
  member_id: string;
  role: GroupRole;
  status: MembershipStatus;
  heads: number;
  joined_at: string | null;
  members: { id: string; full_name: string | null; email: string | null; verification_status: string } | null;
}

export async function listMembers(groupId: string) {
  const res = await api.get<{ members: GroupMember[] }>(`/api/groups/${groupId}/members`);
  return res.members ?? [];
}
export function approveMember(groupId: string, memberId: string) {
  return api.patch(`/api/groups/${groupId}/members/${memberId}/approve`);
}
export function rejectMember(groupId: string, memberId: string, reason?: string) {
  return api.patch(`/api/groups/${groupId}/members/${memberId}/reject`, { reason });
}
export function setMemberRole(groupId: string, memberId: string, role: GroupRole) {
  return api.patch(`/api/groups/${groupId}/members/${memberId}/role`, { role });
}
export function removeMember(groupId: string, memberId: string) {
  return api.del(`/api/groups/${groupId}/members/${memberId}`);
}