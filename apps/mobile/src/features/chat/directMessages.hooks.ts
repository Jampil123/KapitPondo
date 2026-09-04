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

const PAGE_SIZE = 30;

export function useDirectMessages(
  groupId: string | undefined,
  otherMemberId: string | undefined,
  myMemberId: string | undefined,
) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!groupId || !otherMemberId || !myMemberId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    seenIds.current = new Set();
    setHasMore(true);

    listDirectMessages(groupId, otherMemberId, { limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        page.forEach((m) => seenIds.current.add(m.id));
        setMessages(page);
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
  }, [groupId, otherMemberId, myMemberId]);

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
