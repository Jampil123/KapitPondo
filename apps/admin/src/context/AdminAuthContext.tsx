/**
 * apps/admin/src/context/AdminAuthContext.tsx
 * ----------------------------------------------------------------------------
 * Admin auth: sign in via Supabase, then confirm the account is a system
 * admin by calling GET /admin/me (services/api checks platform_admins via
 * the requireSystemAdmin middleware). A logged-in user who is NOT a
 * sysadmin is treated as unauthorized (no admin access).
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { describeDevice } from '../lib/device';

export type AdminMe = { user_id: string; email?: string; full_name?: string | null; avatar_url?: string | null };

type AdminAuthValue = {
  session: Session | null;
  admin: AdminMe | null;
  loading: boolean;
  isSysadmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Settings edits the profile; this keeps the sidebar in step without a refetch.
  updateAdmin: (patch: Partial<AdminMe>) => void;
};

const Ctx = createContext<AdminAuthValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  // The user the current `admin` value was resolved for. Supabase re-emits
  // auth events on every token refresh and whenever the tab regains focus;
  // only a different user should re-check sysadmin status. Otherwise the
  // guard flips to its loader, unmounting every page and refetching its data.
  const resolvedFor = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      const userId = s?.user.id ?? null;
      if (userId === resolvedFor.current) return;
      resolvedFor.current = userId;
      if (!userId) { setAdmin(null); setLoading(false); return; }
      setLoading(true);
      // Deferred: calling Supabase (api.get reads the session) inside this
      // callback deadlocks the auth lock, leaving the console stuck loading.
      setTimeout(async () => {
        let me: AdminMe | null;
        try {
          // GET /admin/me → 200 with the admin record if platform admin, else 403.
          me = await api.get<AdminMe>('/admin/me');
        } catch {
          me = null; // signed in, but not a sysadmin
        }
        if (!active || resolvedFor.current !== userId) return;
        setAdmin(me);
        setLoading(false);
      }, 0);
    });
    return () => {
      active = false;
      resolvedFor.current = undefined; // a remount (StrictMode) must resolve again
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Login history for Settings; best-effort, never blocks sign-in.
    api.post('/me/login-activity', { device_label: describeDevice(navigator.userAgent), platform: 'Admin console' }).catch(() => {});
  }

  function updateAdmin(patch: Partial<AdminMe>) {
    setAdmin((a) => (a ? { ...a, ...patch } : a));
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAdmin(null);
  }

  return (
    <Ctx.Provider value={{ session, admin, loading, isSysadmin: !!admin, signIn, signOut, updateAdmin }}>
      {children}
    </Ctx.Provider>
  );
}

// Provider + hook colocated in one file is the standard context pattern;
// react-refresh's "only export components" check doesn't special-case hooks.
// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return v;
}
