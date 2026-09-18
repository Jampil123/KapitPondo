/**
 * api/loginActivity.ts
 * ----------------------------------------------------------------------------
 * Self-reported session history. Sign-in happens entirely client-side
 * against Supabase Auth (AuthContext.tsx), so the backend has no other way
 * to see a login — recordLoginActivity() is called right after a session is
 * established, authenticated by the fresh session token it just got.
 */
import { api } from './client';

export interface LoginActivityEntry {
  id: string;
  device_label: string | null;
  platform: string | null;
  app_version: string | null;
  created_at: string;
}

export async function recordLoginActivity(input: {
  device_label?: string;
  platform?: string;
  app_version?: string;
}): Promise<void> {
  await api.post('/api/me/login-activity', input);
}

export async function listLoginActivity(): Promise<LoginActivityEntry[]> {
  const res = await api.get<{ entries: LoginActivityEntry[] }>('/api/me/login-activity');
  return res.entries;
}
