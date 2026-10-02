import { useCallback, useEffect, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { getChatReads, markChatRead, listRoomReaders, type ChatConversation, type ChatReads, type RoomReader } from '@/api/chatReads';

/**
 * Read marks live on the server (chat_reads, migration 0064): when each member
 * last opened each conversation — 'general', 'officers', 'announcements' or
 * `dm:<other member id>`. They drive bold-when-unread in the chat list and
 * "Seen" under the newest message.
 */
const watch = (groupId: string | undefined) => (groupId ? { table: 'chat_reads', filter: `group_id=eq.${groupId}` } : null);

/** The caller's own marks, and each DM partner's mark on their side of it. */
export function useChatReads(groupId: string | undefined) {
  const fn = useCallback(() => (groupId ? getChatReads(groupId) : Promise.resolve<ChatReads>({ mine: {}, theirs: {} })), [groupId]);
  return useQuery(fn, [groupId], watch(groupId));
}

// Marks made on this device, applied at once so the chat list never waits on
// the server round trip (or shows a chat bold again if the request is slow or
// fails). Kept per member and group, and saved so they outlast a restart.
const local = new Map<string, Record<string, string>>();
const localListeners = new Set<() => void>();
const localKey = (memberId: string, groupId: string) => `chatSeen:${memberId}:${groupId}`;

function markLocal(key: string, conversation: string) {
  const next = { ...local.get(key), [conversation]: new Date().toISOString() };
  local.set(key, next);
  localListeners.forEach((fn) => fn());
  AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
}

function later(a: string | undefined, b: string | undefined) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** The caller's read marks: the server's, overlaid with any newer ones made on this device. */
export function useMyChatReads(groupId: string | undefined) {
  const { member } = useAuth();
  const reads = useChatReads(groupId);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const key = groupId && member?.id ? localKey(member.id, groupId) : null;

  useEffect(() => {
    localListeners.add(rerender);
    return () => { localListeners.delete(rerender); };
  }, []);

  useEffect(() => {
    if (!key || local.has(key)) return;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        local.set(key, { ...JSON.parse(raw), ...local.get(key) });
        rerender();
      })
      .catch(() => {});
  }, [key]);

  const mine = reads.data?.mine ?? {};
  const mineLocal = (key && local.get(key)) || {};
  const seen: Record<string, string> = {};
  for (const c of new Set([...Object.keys(mine), ...Object.keys(mineLocal)])) seen[c] = later(mine[c], mineLocal[c])!;
  return { reads, seen };
}

/** Everyone else's mark on a shared room — for "Seen by". */
export function useRoomReaders(groupId: string | undefined, room: 'general' | 'officers', enabled = true) {
  const fn = useCallback(
    () => (groupId && enabled ? listRoomReaders(groupId, room) : Promise.resolve([] as RoomReader[])),
    [groupId, room, enabled],
  );
  return useQuery(fn, [groupId, room, enabled], enabled ? watch(groupId) : null);
}

/**
 * Marks a conversation read while its screen is open: on arrival, whenever a
 * new message lands (`latestId`), and on leaving.
 */
export function useMarkChatSeen(groupId: string | undefined, conversation: ChatConversation | undefined, latestId?: string) {
  const { member } = useAuth();
  const memberId = member?.id;
  const focused = useRef(false);
  const mark = useCallback(() => {
    if (!groupId || !conversation) return;
    if (memberId) markLocal(localKey(memberId, groupId), conversation);
    markChatRead(groupId, conversation).catch(() => {});
  }, [groupId, conversation, memberId]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      mark();
      return () => { focused.current = false; mark(); };
    }, [mark]),
  );

  useEffect(() => {
    if (latestId && focused.current) mark();
  }, [latestId, mark]);
}

/** Unread when the newest message came from someone else after the conversation was last opened. */
export function isUnread(latestAt: string | undefined, fromMe: boolean, seenAt: string | undefined) {
  if (!latestAt || fromMe) return false;
  return !seenAt || Date.parse(latestAt) > Date.parse(seenAt);
}

/** Whether a read mark covers a message. */
export function hasSeen(readAt: string | undefined, messageAt: string) {
  return !!readAt && Date.parse(readAt) >= Date.parse(messageAt);
}

/** Readers of a room who have seen `message`, leaving out its sender and the viewer. */
export function seenBy(readers: RoomReader[], message: { sender_id: string; created_at: string }, viewerId: string | undefined) {
  return readers.filter((r) => r.member_id !== message.sender_id && r.member_id !== viewerId && hasSeen(r.last_read_at, message.created_at));
}

/** "Seen by Ana", "Seen by Ana and Jay", "Seen by Ana, Jay +3". */
export function seenByLabel(readers: { full_name: string | null }[]) {
  const names = readers.map((r) => (r.full_name ?? 'Someone').trim().split(/\s+/)[0]);
  if (names.length === 0) return null;
  if (names.length <= 2) return `Seen by ${names.join(' and ')}`;
  return `Seen by ${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}
