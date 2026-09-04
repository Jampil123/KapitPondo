/**
 * api/announcements.ts
 * ----------------------------------------------------------------------------
 * Owner-authored group broadcasts (read by any active member) + private
 * targeted payment reminders (Owner/Treasurer only, one notification per
 * recipient — never a group-readable record of who owes money).
 */
import { api } from './client';
import type { GroupRole } from '../constants/roles';

export type AnnouncementType = 'reminder' | 'meeting' | 'cycle' | 'urgent';
export type AnnouncementAudience = 'all' | 'unpaid' | 'officers';

export interface Announcement {
  id: string;
  group_id: string;
  sender_name: string;
  sender_role: GroupRole;
  type: AnnouncementType;
  body: string;
  audience: AnnouncementAudience;
  recipient_count: number;
  created_at: string;
}

/** GET /api/groups/:groupId/announcements — any active member. */
export async function listAnnouncements(groupId: string, opts: { limit?: number; before?: string } = {}) {
  const res = await api.get<{ announcements: Announcement[] }>(`/api/groups/${groupId}/announcements`, {
    limit: opts.limit,
    before: opts.before,
  });
  return res.announcements ?? [];
}

/** POST /api/groups/:groupId/announcements — Owner only. */
export function createAnnouncement(groupId: string, input: {
  type: AnnouncementType; body: string; audience: AnnouncementAudience; send_push?: boolean;
}) {
  return api.post<{ announcement: Announcement }>(`/api/groups/${groupId}/announcements`, input);
}

export interface UnpaidMember {
  member_id: string;
  full_name: string | null;
}

/** GET /api/groups/:groupId/members/unpaid — officer-only; drives the reminder audience. */
export async function listUnpaidMembers(groupId: string) {
  const res = await api.get<{ members: UnpaidMember[] }>(`/api/groups/${groupId}/members/unpaid`);
  return res.members;
}

/** POST /api/groups/:groupId/members/remind — Owner/Treasurer only; private, targeted. */
export function sendReminder(groupId: string, message: string) {
  return api.post<{ sent_count: number; members: UnpaidMember[] }>(`/api/groups/${groupId}/members/remind`, { message });
}
