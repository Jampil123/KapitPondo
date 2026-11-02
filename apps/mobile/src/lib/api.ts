// apps/mobile/src/lib/api.ts
// Calls the KapitPondo Node backend, automatically attaching the logged-in
// user's Supabase access token.
//
// Android devices/emulators cannot reach the dev machine via "localhost" —
// they need the LAN IP.  In __DEV__ mode we extract the host from the Expo
// bundler URL (which Expo already knows) so the API URL resolves correctly
// on both physical devices and emulators without any manual config.

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

function resolveApiUrl(): string {
  if (__DEV__) {
    // Expo embeds the bundler host in several places depending on the SDK/client.
    // Try each in order of reliability.
    const host =
      (Platform.OS === 'web' ? window.location.hostname : '') ||
      Constants.expoGoConfig?.debuggerHost?.split(':')[0] ||
      (Constants as any).manifest?.debuggerHost?.split(':')[0] ||
      Constants.expoConfig?.hostUri?.split(':')[0] ||
      'localhost';
    return `http://${host}:4000/api`;
  }
  // Production: use the env var set at build time.
  return process.env.EXPO_PUBLIC_API_URL as string;
}

const API_URL = resolveApiUrl();

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T = any>(method: Method, path: string, body?: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get:    <T = any>(path: string)                => request<T>('GET',    path),
  post:   <T = any>(path: string, body?: unknown) => request<T>('POST',   path, body),
  patch:  <T = any>(path: string, body?: unknown) => request<T>('PATCH',  path, body),
  delete: <T = any>(path: string)                => request<T>('DELETE', path),
};
