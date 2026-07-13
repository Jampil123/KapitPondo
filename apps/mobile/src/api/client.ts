/**
 * api/client.ts
 * ----------------------------------------------------------------------------
 * The single HTTP layer for the app. Every api/*.ts module calls apiFetch.
 * Responsibilities:
 *   - resolve the API base URL (LAN IP in dev, EXPO_PUBLIC_API_URL in prod)
 *   - attach the current Supabase access token as a Bearer header
 *   - parse JSON and throw a typed ApiError on non-2xx responses
 *
 * Screens never call fetch directly and never touch tokens — they call the
 * typed helpers in api/members.ts, api/groups.ts, etc.
 */
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

/** Resolve where the API lives. */
function resolveBaseUrl(): string {
  if (__DEV__) {
    // A phone/emulator can't reach the dev machine's "localhost", so derive
    // the machine's LAN IP from Expo's host (e.g. "192.168.1.10:8081").
    const hostUri =
      Constants.expoConfig?.hostUri ??
      // @ts-expect-error legacy field on older Expo runtimes
      Constants.manifest?.debuggerHost ??
      '';
    const host = hostUri.split(':')[0];
    const port = process.env.EXPO_PUBLIC_API_PORT ?? '4000';

    return host ? `http://${host}:${port}` : `http://localhost:${port}`;
  }

  // Production: explicit env var wins.
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  return (explicit ?? '').replace(/\/+$/, '');
}

export const API_BASE_URL = resolveBaseUrl();

/** Error thrown for any non-2xx response. Screens can branch on `status`. */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & {
  /** Plain object — serialized to JSON automatically. */
  body?: unknown;
  /** Query params appended to the URL. */
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: ApiOptions['query']): string {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${url}?${qs}` : url;
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Core request. Returns parsed JSON typed as T. */
export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };
  if (session?.access_token) {
    finalHeaders.Authorization = `Bearer ${session.access_token}`;
  }

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    res = await fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    // Network-level failure (server down, wrong LAN IP, no connection, or a
    // cold-start hang that hit the timeout above).
    throw new ApiError(0, 'Network request failed. Check your connection and API URL.', 'NETWORK', e);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  const json = text ? safeParse(text) : null;

  if (!res.ok) {
    const message = json?.message || json?.error || res.statusText || 'Request failed';
    throw new ApiError(res.status, message, json?.code, json);
  }

  return json as T;
}

/** Convenience verbs. */
export const api = {
  get: <T>(path: string, query?: ApiOptions['query']) => apiFetch<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  del: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'DELETE', body }),
};