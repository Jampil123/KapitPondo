/**
 * apps/admin/src/lib/supabase.ts — the admin console's Supabase client.
 * Uses the ANON key (safe to ship; RLS + the requireSystemAdmin backend
 * middleware protect data). Persists the session via the browser's
 * localStorage (Supabase's default for web), so admins stay signed in.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey);