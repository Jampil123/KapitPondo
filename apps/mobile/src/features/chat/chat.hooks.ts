/**
 * features/chat/chat.hooks.ts
 * ----------------------------------------------------------------------------
 * useMessages(groupId, channel) — paginated history + realtime-appended live
 * messages for one chat screen. Not a useQuery consumer: it owns an array
 * (not a single `data` snapshot) across two write paths — initial/older-page
 * fetches (REST) and live inserts (Realtime) — that must merge without dupes.
 *
 *   const { messages, loading, loadingMore, hasMore, loadMore, error } = useMessages(groupId, channel);
 *   const { send, sending } = useSendMessage(groupId, channel);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAction } from '../../hooks/useApi';
import { listMessages, sendMessage, type ChatChannel, type ChatMessage } from '../../api/messages';

const PAGE_SIZE = 30;

export function useMessages(groupId: string | undefined, channel: ChatChannel) {
  // Newest-first internally (matches API order + inverted FlatList's natural order).
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  // Initial fetch + resubscribe whenever groupId/channel changes.
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    seenIds.current = new Set();
    setHasMore(true);

    listMessages(groupId, channel, { limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        page.forEach((m) => seenIds.current.add(m.id));
        setMessages(page);
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));

    // Realtime: one subscription per group (filter is group_id only — Realtime
    // doesn't support a compound filter), channel checked client-side.
    const sub = supabase
      .channel(`messages:group:${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          if (row.channel !== channel) return; // client-side channel filter
          if (seenIds.current.has(row.id)) return; // dedup (e.g. re-subscribe races)
          seenIds.current.add(row.id);
          setMessages((prev) => [row, ...prev]); // newest-first prepend
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(sub); // cleanup on unmount AND on groupId/channel change
    };
  }, [groupId, channel]);

  const loadMore = useCallback(async () => {
    if (!groupId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[messages.length - 1];
      const page = await listMessages(groupId, channel, { limit: PAGE_SIZE, before: oldest.created_at });
      page.forEach((m) => seenIds.current.add(m.id));
      setMessages((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, channel, messages, loadingMore, hasMore]);

  return { messages, loading, loadingMore, hasMore, loadMore, error };
}

/** send() posts; the realtime INSERT (above) is what actually appends it to
 *  the list — no optimistic local append, so there's no dedup/rollback edge
 *  case if the POST succeeds but the realtime echo is briefly delayed. `sending`
 *  should disable the composer's send button for that (typically sub-second) gap. */
export function useSendMessage(groupId: string, channel: ChatChannel) {
  const { run, loading, error } = useAction((body: string) => sendMessage(groupId, channel, body));
  return { send: run, sending: loading, error };
}
