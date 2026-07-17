/**
 * api/notifications.ts
 * ----------------------------------------------------------------------------
 * Calls the notifications module of the API (cross-cutting — every module
 * writes rows via services/api/src/lib/notifications.js; this is the read side).
 */
import { api } from './client';

export interface Notification {
  id: string;
  member_id: string;
  group_id: string | null;
  type: string;
  title: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

/** GET /api/me/notifications — newest first. */
export async function listNotifications(opts?: { unreadOnly?: boolean; limit?: number }) {
  const res = await api.get<{ notifications: Notification[] }>('/api/me/notifications', {
    unread: opts?.unreadOnly || undefined,
    limit: opts?.limit,
  });
  return res.notifications ?? [];
}

/** POST /api/me/notifications/:id/read */
export function markNotificationRead(id: string) {
  return api.post<{ notification: Notification }>(`/api/me/notifications/${id}/read`);
}

/** POST /api/me/notifications/read-all */
export function markAllNotificationsRead() {
  return api.post<{ ok: true }>('/api/me/notifications/read-all');
}
