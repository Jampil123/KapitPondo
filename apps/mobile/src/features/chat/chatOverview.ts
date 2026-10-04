import { useCallback } from 'react';
import { useQuery } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { can } from '@/constants/roles';
import { useMemberDirectory } from './chatCache';
import { listMessages } from '@/api/messages';
import { listDirectMessages, type DirectMessage } from '@/api/directMessages';
import { useAnnouncements } from '@/features/announcements/announcements.hooks';
import { useMyChatReads, isUnread } from './chatSeen';

/**
 * Every conversation's newest message and the caller's read marks — shared by
 * the chat list and the unread badge on the Chat tab so the two always agree.
 * New messages arrive over Realtime, so both update live.
 */
export function useChatOverview(groupId: string | undefined) {
  const { member } = useAuth();
  const { role } = useActiveGroup();
  const canOfficersRoom = can(role, 'viewOfficersChat');
  const groupFilter = `group_id=eq.${groupId}`;

  const directory = useMemberDirectory(groupId);
  const lastGeneral = useQuery(
    () => listMessages(groupId!, 'general', { limit: 1 }),
    [groupId],
    { table: 'messages', filter: groupFilter, event: 'INSERT' },
  );
  const lastOfficers = useQuery(
    () => (canOfficersRoom ? listMessages(groupId!, 'officers', { limit: 1 }) : Promise.resolve([])),
    [groupId, canOfficersRoom],
    canOfficersRoom ? { table: 'messages', filter: groupFilter, event: 'INSERT' } : null,
  );
  const announcements = useAnnouncements(groupId);

  const others = (directory.data ?? []).filter((m) => m.member_id !== member?.id);
  const otherIds = others.map((m) => m.member_id).join(',');
  const lastDms = useQuery(
    async () => {
      const ids = otherIds ? otherIds.split(',') : [];
      const pages = await Promise.all(ids.map((id) => listDirectMessages(groupId!, id, { limit: 1 }).catch(() => [] as DirectMessage[])));
      return Object.fromEntries(ids.map((id, i) => [id, pages[i][0]])) as Record<string, DirectMessage | undefined>;
    },
    [groupId, otherIds],
    { table: 'direct_messages', filter: groupFilter, event: 'INSERT' },
  );

  const { reads, seen } = useMyChatReads(groupId);

  const latestAnnouncement = announcements.data?.[0];
  const latestGeneral = lastGeneral.data?.[0];
  const latestOfficers = lastOfficers.data?.[0];
  const latestDm = (id: string) => lastDms.data?.[id];

  const unread = {
    announcements: isUnread(latestAnnouncement?.created_at, role === 'owner', seen.announcements),
    general: isUnread(latestGeneral?.created_at, latestGeneral?.sender_id === member?.id, seen.general),
    officers: canOfficersRoom && isUnread(latestOfficers?.created_at, latestOfficers?.sender_id === member?.id, seen.officers),
    dm: (id: string) => {
      const m = latestDm(id);
      return isUnread(m?.created_at, m?.sender_id === member?.id, seen[`dm:${id}`]);
    },
  };
  const unreadCount =
    Number(unread.announcements) + Number(unread.general) + Number(unread.officers)
    + others.filter((m) => unread.dm(m.member_id)).length;

  const refetch = useCallback(
    () => Promise.all([directory.refetch(), lastGeneral.refetch(), lastOfficers.refetch(), announcements.refetch(), lastDms.refetch(), reads.refetch()]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [directory.refetch, lastGeneral.refetch, lastOfficers.refetch, announcements.refetch, lastDms.refetch, reads.refetch],
  );

  return {
    directory, others, canOfficersRoom, reads,
    latestAnnouncement, latestGeneral, latestOfficers, latestDm,
    unread, unreadCount, refetch,
  };
}
