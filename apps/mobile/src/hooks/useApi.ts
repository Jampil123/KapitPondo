/**
 * hooks/useApi.ts
 * ----------------------------------------------------------------------------
 * Turns an async API call into { data, loading, error, ... } so screens don't
 * juggle try/catch + useState everywhere. Two hooks:
 *
 *   useQuery  — runs on mount (and when deps change). For reads.
 *   useAction — runs when you call run(). For writes/buttons.
 *
 * Errors are ApiError instances, so screens can branch on `error.status`.
 *
 * useQuery also takes an optional `realtime` watch list — one or more
 * Postgres tables to subscribe to (via Supabase Realtime) that silently
 * refetch this query whenever a matching row changes, so dashboards/lists
 * stay live instead of only refreshing on remount or pull-to-refresh. This
 * mirrors the subscribe-and-merge pattern already used by AuthContext/
 * NotificationsContext/chat.hooks.ts, generalized as "subscribe, then
 * refetch" so individual feature hooks don't each reimplement channel
 * wiring — they just refetch(), same as any other data change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { supabase } from '../lib/supabase';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

export type RealtimeWatch = {
  table: string;
  /** Postgres changes filter, e.g. `group_id=eq.${groupId}`. Omit to watch every row (rare — prefer scoping). */
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
};

/** Read-on-mount. Pass a stable fn or wrap in useCallback. */
export function useQuery<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  realtime?: RealtimeWatch | RealtimeWatch[] | null,
) {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (mounted.current) setState({ data, loading: false, error: null });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, (e as Error).message);
      if (mounted.current) setState({ data: null, loading: false, error: err });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mounted.current = true;
    refetch();
    return () => {
      mounted.current = false;
    };
  }, [refetch]);

  const watches = realtime ? (Array.isArray(realtime) ? realtime : [realtime]) : [];
  const watchKey = watches.map((w) => `${w.table}:${w.event ?? '*'}:${w.filter ?? ''}`).join('|');

  useEffect(() => {
    if (watches.length === 0) return;

    // Several tables can change together in one action (e.g. approving a
    // contribution inserts a ledger_entries row AND updates the
    // contributions row) — collapse that burst into a single refetch.
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        if (mounted.current) refetch();
      }, 200);
    };

    const channel = supabase.channel(`useQuery:${watchKey}:${Math.random().toString(36).slice(2, 8)}`);
    watches.forEach((w) => {
      channel.on(
        'postgres_changes',
        { event: w.event ?? '*', schema: 'public', table: w.table, filter: w.filter },
        scheduleRefetch,
      );
    });
    channel.subscribe();

    return () => {
      if (debounceId) clearTimeout(debounceId);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey, refetch]);

  return { ...state, refetch };
}

/** Trigger-on-demand. For submits, approvals, etc. */
export function useAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setLoading(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, (e as Error).message);
        setError(err);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [fn],
  );

  return { run, loading, error };
}