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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

/** Read-on-mount. Pass a stable fn or wrap in useCallback. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
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