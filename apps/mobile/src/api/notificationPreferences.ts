/**
 * api/notificationPreferences.ts
 * ----------------------------------------------------------------------------
 * PATCH /api/me/notification-preferences — enforced server-side at the one
 * choke point every notification passes through (notify() in
 * services/api/src/lib/notifications.js), not just a decorative toggle.
 */
import { api } from './client';
import type { NotificationPreferences } from './members';

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const res = await api.patch<{ notification_preferences: NotificationPreferences }>(
    '/api/me/notification-preferences',
    patch,
  );
  return res.notification_preferences;
}
