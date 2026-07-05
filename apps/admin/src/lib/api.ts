/**
 * apps/admin/src/lib/api.ts — thin client to services/api.
 * Every call carries the admin's Supabase session as a Bearer token; the API's
 * requireSysadmin middleware authorizes it. Mirrors the mobile apiFetch.
 */
import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? body?.message ?? res.statusText);
  return body as T;
}

export const api = {
  get: <T>(p: string) => apiFetch<T>(p),
  post: <T>(p: string, b?: unknown) => apiFetch<T>(p, { method: 'POST', body: b ? JSON.stringify(b) : undefined }),
};