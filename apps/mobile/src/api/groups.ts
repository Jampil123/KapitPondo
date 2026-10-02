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

export type GcashStatus = 'unset' | 'pending' | 'approved' | 'rejected';

export interface Group {
  id: string;
  name: string;
  fund_code: string;
  description: string | null;
  status: GroupStatus;
  owner: { full_name: string | null; avatar_url?: string | null } | null;
  /** The LIVE, member-visible GCash number the "pay online" sheet shows — only ever set by an Owner approval (see submitGcashProposal/approveGcashProposal). Null until the first approval. */
  treasurer_gcash_number: string | null;
  treasurer_gcash_name: string | null;
  /** Storage path (private `proofs` bucket) to the Treasurer's own real GCash "Receive Money" QR screenshot — shown as-is via useSignedProofUrl, never generated (a generated EMVCo/QR-Ph payload isn't reliably scannable without GCash's own registered merchant fields). Optional — the copyable number/amount/reference always work regardless. */
  treasurer_gcash_qr_url: string | null;
  treasurer_gcash_pending_qr_url: string | null;
  /** The one GCash proposal "in flight" at a time — see GroupSettings (group/settings.tsx) for the Treasurer/Owner workflow this drives. */
  treasurer_gcash_status: GcashStatus;
  treasurer_gcash_pending_number: string | null;
  treasurer_gcash_pending_name: string | null;
  treasurer_gcash_note: string | null;
  treasurer_gcash_rejection_reason: string | null;
  treasurer_gcash_submitted_by: string | null;
  treasurer_gcash_submitted_at: string | null;
  treasurer_gcash_reviewed_by: string | null;
  treasurer_gcash_reviewed_at: string | null;
}

/** A membership row from GET /groups: my role + status + the nested group. */
export interface MyGroup {
  id: string;
  role: GroupRole;
  status: MembershipStatus;
  /** Why the membership is suspended — "Withdrawal in progress" while withdrawing. */
  status_reason?: string | null;
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

// ── GCash channel: Treasurer proposes, Owner approves ───────────────────────
// After any of these calls succeed, also call useGroups().refresh() so
// useActiveGroup().group picks up the change (none of these update the
// cached groups list themselves).

export interface GcashProposalInput {
  number: string;
  name: string;
  note?: string;
  /** Storage path to the Treasurer's uploaded real GCash QR screenshot, if they attached one (see lib/upload.ts's uploadImage('proofs', ...)). */
  qr_url?: string;
}

/** POST /api/groups/:groupId/gcash/propose — Treasurer only. 409 if a submission is already pending. */
export function submitGcashProposal(groupId: string, input: GcashProposalInput) {
  return api.post<{ group: Group }>(`/api/groups/${groupId}/gcash/propose`, input);
}

/** POST /api/groups/:groupId/gcash/cancel — Treasurer only, withdraws their own pending submission. */
export function cancelGcashProposal(groupId: string) {
  return api.post<{ group: Group }>(`/api/groups/${groupId}/gcash/cancel`);
}

/** POST /api/groups/:groupId/gcash/approve — Owner only. */
export function approveGcashProposal(groupId: string) {
  return api.post<{ group: Group }>(`/api/groups/${groupId}/gcash/approve`);
}

/** POST /api/groups/:groupId/gcash/reject — Owner only, reason required. */
export function rejectGcashProposal(groupId: string, reason: string) {
  return api.post<{ group: Group }>(`/api/groups/${groupId}/gcash/reject`, { reason });
}

export interface GcashHistoryEntry {
  id: string;
  action: 'proposed' | 'cancelled' | 'approved' | 'rejected';
  created_at: string;
  actor: { full_name: string | null } | null;
  after_data: { number?: string; name?: string; note?: string | null; reason?: string } | null;
}

/** GET /api/groups/:groupId/gcash/history — Treasurer + Owner only. */
export async function listGcashHistory(groupId: string) {
  const res = await api.get<{ entries: GcashHistoryEntry[] }>(`/api/groups/${groupId}/gcash/history`);
  return res.entries ?? [];
}

/** A group's officer, name + role (+ a verified badge) — no email/phone — any active member can see this. */
export interface Officer {
  role: GroupRole;
  full_name: string | null;
  avatar_url?: string | null;
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
  avatar_url?: string | null;
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
  /** Why the member is suspended (set by the Organizer), or "Withdrawal in progress". */
  status_reason?: string | null;
  members: { id: string; full_name: string | null; avatar_url?: string | null; email: string | null; verification_status: string } | null;
}

/** Active members; `includeSuspended` adds suspended ones (the manage-members view). */
export async function listMembers(groupId: string, opts: { includeSuspended?: boolean } = {}) {
  const res = await api.get<{ members: GroupMember[] }>(`/api/groups/${groupId}/members`, opts.includeSuspended ? { include: 'suspended' } : undefined);
  return res.members ?? [];
}

// --- Suspend / reactivate / withdraw (UC-GM-04) -------------------------------

/** What a member would be paid on withdrawing now. payout = capital − loan_owed − penalties. */
export interface Settlement {
  /** Contributions posted since the last year-end share. */
  capital: number;
  /** Loan principal left + interest not yet paid. */
  loan_owed: number;
  /** Unpaid penalties. */
  penalties: number;
  payout: number;
  /** Anything that stops a withdrawal right now. */
  blockers: string[];
}

export type WithdrawalStatus = 'pending_release' | 'released' | 'verified' | 'cancelled';

export interface Withdrawal {
  id: string;
  group_id: string;
  membership_id: string;
  status: WithdrawalStatus;
  capital: number;
  loan_owed: number;
  penalties: number;
  payout: number;
  note: string | null;
  initiated_by: string;
  initiated_at: string;
  released_by: string | null;
  released_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  initiator?: { full_name: string | null } | null;
  releaser?: { full_name: string | null } | null;
  verifier?: { full_name: string | null } | null;
  membership?: { member_id: string; members: { full_name: string | null; avatar_url?: string | null } | null } | null;
}

export interface MemberStanding {
  membership: {
    id: string; member_id: string; role: GroupRole; status: MembershipStatus; heads: number;
    status_reason: string | null; status_changed_at: string | null;
    members: { full_name: string | null; avatar_url?: string | null } | null;
  };
  settlement: Settlement;
  withdrawal: Withdrawal | null;
}

/** GET — the member, their settlement if they withdrew now, and their latest withdrawal. Officers. */
export function getMemberStanding(groupId: string, membershipId: string) {
  return api.get<MemberStanding>(`/api/groups/${groupId}/memberships/${membershipId}/standing`);
}
/** POST — Organizer. Reason is shown to the member. */
export function suspendMembership(groupId: string, membershipId: string, reason: string) {
  return api.post(`/api/groups/${groupId}/memberships/${membershipId}/suspend`, { reason });
}
export function reactivateMembership(groupId: string, membershipId: string) {
  return api.post(`/api/groups/${groupId}/memberships/${membershipId}/reactivate`);
}
/** POST — Organizer starts it; the Treasurer releases the payout, the Auditor verifies. */
export function startWithdrawal(groupId: string, membershipId: string, note?: string) {
  return api.post<{ withdrawal: Withdrawal }>(`/api/groups/${groupId}/memberships/${membershipId}/withdraw`, { note });
}
/** GET — withdrawals waiting for release or verification. Officers. */
export async function listWithdrawals(groupId: string) {
  const res = await api.get<{ withdrawals: Withdrawal[] }>(`/api/groups/${groupId}/withdrawals`);
  return res.withdrawals ?? [];
}
export function releaseWithdrawal(groupId: string, id: string) {
  return api.post<{ withdrawal: Withdrawal }>(`/api/groups/${groupId}/withdrawals/${id}/release`);
}
export function verifyWithdrawal(groupId: string, id: string) {
  return api.post<{ withdrawal: Withdrawal }>(`/api/groups/${groupId}/withdrawals/${id}/verify`);
}
/** POST — Organizer, before the cash is released. */
export function cancelWithdrawal(groupId: string, id: string, reason: string) {
  return api.post<{ withdrawal: Withdrawal }>(`/api/groups/${groupId}/withdrawals/${id}/cancel`, { reason });
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

/** POST — send a reminder push to a specific member (e.g. behind on contributions). Any officer. */
export function nudgeMember(groupId: string, memberId: string) {
  return api.post<{ ok: true }>(`/api/groups/${groupId}/members/${memberId}/nudge`);
}