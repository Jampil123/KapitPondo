/**
 * features/chat/directMessages.hooks.ts
 * ----------------------------------------------------------------------------
 * useDirectMessages(groupId, otherMemberId, myMemberId) — paginated history +
 * realtime-appended live messages for one 1:1 conversation. Same
 * merge-without-dupes shape as chat.hooks.ts's useMessages, filtered
 * client-side to just this pair (Realtime can't filter on a compound OR).
 *
 *   const { messages, loading, loadingMore, hasMore, loadMore, error } =
 *     useDirectMessages(groupId, otherMemberId, myMemberId);
 *   const { send, sending } = useSendDirectMessage(groupId, otherMemberId);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAction } from '../../hooks/useApi';
import { listDirectMessages, sendDirectMessage, type DirectMessage } from '../../api/directMessages';
import { readCache, writeCache, loadPersisted, dmCacheKey, mergeFreshPage } from './chatCache';

const PAGE_SIZE = 30;

export function useDirectMessages(
  groupId: string | undefined,
  otherMemberId: string | undefined,
  myMemberId: string | undefined,
) {
  const cacheKey = groupId && otherMemberId && myMemberId ? dmCacheKey(myMemberId, groupId, otherMemberId) : undefined;
  // Seeded from the cache so a reopened conversation is on screen in the very first frame.
  const [messages, setMessages] = useState<DirectMessage[]>(() => (cacheKey && readCache<DirectMessage[]>(cacheKey)) || []);
  const [loading, setLoading] = useState(() => !(cacheKey && readCache(cacheKey)));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  // Cached messages show first; the fetch then refreshes them.
  useEffect(() => {
    if (!groupId || !otherMemberId || !myMemberId || !cacheKey) return;
    let cancelled = false;
    let fetched = false;
    const cached = readCache<DirectMessage[]>(cacheKey);
    setLoading(!cached);
    setError(null);
    setMessages(cached ?? []);
    seenIds.current = new Set(cached?.map((m) => m.id));
    setHasMore(true);
    if (!cached) {
      loadPersisted<DirectMessage[]>(cacheKey).then((stored) => {
        if (cancelled || fetched || !stored) return;
        stored.forEach((m) => seenIds.current.add(m.id));
        setMessages(stored);
        setLoading(false);
      });
    }

    listDirectMessages(groupId, otherMemberId, { limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        fetched = true;
        page.forEach((m) => seenIds.current.add(m.id));
        setMessages((prev) => mergeFreshPage(page, prev));
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));

    const sub = supabase
      .channel(`dm:${groupId}:${[myMemberId, otherMemberId].sort().join(':')}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as DirectMessage;
          const isThisConversation =
            (row.sender_id === myMemberId && row.recipient_id === otherMemberId) ||
            (row.sender_id === otherMemberId && row.recipient_id === myMemberId);
          if (!isThisConversation) return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) => [row, ...prev]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
  }, [groupId, otherMemberId, myMemberId, cacheKey]);

  useEffect(() => {
    if (cacheKey && !loading) writeCache(cacheKey, messages.slice(0, PAGE_SIZE));
  }, [cacheKey, loading, messages]);

  const loadMore = useCallback(async () => {
    if (!groupId || !otherMemberId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[messages.length - 1];
      const page = await listDirectMessages(groupId, otherMemberId, { limit: PAGE_SIZE, before: oldest.created_at });
      page.forEach((m) => seenIds.current.add(m.id));
      setMessages((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, otherMemberId, messages, loadingMore, hasMore]);

  return { messages, loading, loadingMore, hasMore, loadMore, error };
}

export function useSendDirectMessage(groupId: string, recipientId: string) {
  const { run, loading, error } = useAction((body: string, imageUrl?: string | null) => sendDirectMessage(groupId, recipientId, body, imageUrl));
  return { send: run, sending: loading, error };
}
