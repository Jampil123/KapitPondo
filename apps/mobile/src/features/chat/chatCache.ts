import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@/hooks/useApi';
import { listMemberDirectory, type DirectoryEntry } from '@/api/groups';
import { listMessages, type ChatChannel } from '@/api/messages';
import { listDirectMessages } from '@/api/directMessages';

// Last-known chat data, so a conversation renders instantly on open (Messenger-style) while a fresh fetch runs behind it.
// Kept in memory for the session and mirrored to AsyncStorage so it survives an app restart.
const PREFIX = 'chatCache:';

const memory = new Map<string, unknown>();
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function readCache<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

export function writeCache<T>(key: string, value: T) {
  memory.set(key, value);
  clearTimeout(writeTimers.get(key));
  // Debounced: a busy room would otherwise hit storage on every realtime message.
  writeTimers.set(key, setTimeout(() => {
    writeTimers.delete(key);
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
  }, 500));
}

export async function loadPersisted<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw == null) return undefined;
    const value = JSON.parse(raw) as T;
    if (!memory.has(key)) memory.set(key, value);
    return memory.get(key) as T;
  } catch {
    return undefined;
  }
}

/** Drops every cached conversation — call on sign-out so the next account on this device can't see them. */
export async function clearChatCache() {
  memory.clear();
  writeTimers.forEach(clearTimeout);
  writeTimers.clear();
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

export const roomCacheKey = (me: string, groupId: string, channel: string) => `${me}:${groupId}:room:${channel}`;
export const dmCacheKey = (me: string, groupId: string, other: string) => `${me}:${groupId}:dm:${other}`;

/** The fresh newest page, plus anything newer that arrived over Realtime while it was in flight. Older cached messages are dropped; loadMore pages them back in. */
export function mergeFreshPage<T extends { id: string; created_at: string }>(page: T[], prev: T[]): T[] {
  if (page.length === 0) return [];
  const ids = new Set(page.map((m) => m.id));
  const newer = prev.filter((m) => !ids.has(m.id) && m.created_at > page[0].created_at);
  return [...newer, ...page];
}

/** Fetches a conversation's first page into the cache unless it's already there. */
export async function prefetchConversation<T>(key: string, load: () => Promise<T[]>) {
  if (await loadPersisted(key)) return;
  try {
    writeCache(key, await load());
  } catch {
    // Best effort: the chat screen fetches again when opened.
  }
}

const PREFETCH_PAGE = 30;

/** Warms the cache for every conversation on the chat list, one request at a time, so opening any of them is instant. */
export function usePrefetchConversations(groupId: string | undefined, me: string | undefined, rooms: ChatChannel[], dmIds: string[]) {
  const roomList = rooms.join(',');
  const dmList = dmIds.join(',');
  useEffect(() => {
    if (!groupId || !me) return;
    let cancelled = false;
    (async () => {
      for (const channel of roomList ? (roomList.split(',') as ChatChannel[]) : []) {
        if (cancelled) return;
        await prefetchConversation(roomCacheKey(me, groupId, channel), () => listMessages(groupId, channel, { limit: PREFETCH_PAGE }));
      }
      for (const other of dmList ? dmList.split(',') : []) {
        if (cancelled) return;
        await prefetchConversation(dmCacheKey(me, groupId, other), () => listDirectMessages(groupId, other, { limit: PREFETCH_PAGE }));
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, me, roomList, dmList]);
}

/** The group's member directory, served from cache first so chat headers have a name and avatar on the first frame. */
export function useMemberDirectory(groupId: string | undefined) {
  const key = `${groupId}:directory`;
  const query = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const [cached, setCached] = useState(() => readCache<DirectoryEntry[]>(key));

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    loadPersisted<DirectoryEntry[]>(key).then((v) => { if (!cancelled && v) setCached(v); });
    return () => { cancelled = true; };
  }, [key, groupId]);

  useEffect(() => {
    if (query.data) writeCache(key, query.data);
  }, [key, query.data]);

  return { ...query, data: query.data ?? cached ?? null };
}
