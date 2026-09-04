/**
 * features/announcements/announcements.hooks.ts
 * ----------------------------------------------------------------------------
 * useAnnouncements — realtime-watched list (any active member reads).
 * useUnpaidMembers — officer-only audience preview for reminders/announcements.
 * useCreateAnnouncement / useSendReminder — the two officer write actions.
 */
import { useQuery, useAction } from '../../hooks/useApi';
import {
  listAnnouncements, createAnnouncement, listUnpaidMembers, sendReminder,
} from '../../api/announcements';

export function useAnnouncements(groupId: string | undefined) {
  return useQuery(
    () => listAnnouncements(groupId!),
    [groupId],
    groupId ? { table: 'announcements', filter: `group_id=eq.${groupId}` } : null,
  );
}

export function useUnpaidMembers(groupId: string | undefined) {
  return useQuery(() => listUnpaidMembers(groupId!), [groupId]);
}

export function useCreateAnnouncement(groupId: string) {
  return useAction((input: Parameters<typeof createAnnouncement>[1]) => createAnnouncement(groupId, input));
}

export function useSendReminder(groupId: string) {
  return useAction((message: string) => sendReminder(groupId, message));
}
