// apps/mobile/src/lib/supabase.ts
// The app's Supabase client. Uses the ANON key (safe to ship; RLS protects data).
// Persists the session with AsyncStorage so users stay logged in.

// Must be a top-level import (not a conditional require) so Metro hoists it
// before any Supabase URL parsing runs on Android.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// AsyncStorage on web reads window.localStorage, which doesn't exist during
// Expo Router's SSR pass. This adapter short-circuits all storage calls on the server.
const ssrSafeStorage = {
  getItem: (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.removeItem(key);
  },
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

// On a cold app launch the device's network stack can still be spinning up
// (DNS/radio/TLS not ready yet). supabase-js's own token-refresh call during
// init has no timeout, so a hung request there blocks getSession() forever —
// which stalls both the auth status and the splash screen with no way out.
// A timed-out fetch fails fast instead, letting init finish (it treats a
// failed refresh as non-fatal) so the app can proceed normally.
const FETCH_TIMEOUT_MS = 10_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});