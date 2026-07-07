/**
 * apps/admin/src/context/AdminAuthContext.tsx
 * ----------------------------------------------------------------------------
 * Admin auth: sign in via Supabase, then confirm the account is a system
 * admin by calling GET /admin/me (services/api checks members.is_system_admin
 * via the requireSystemAdmin middleware). A logged-in user who is NOT a
 * sysadmin is treated as unauthorized (no admin access).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

export type AdminMe = { user_id: string; email?: string };

type AdminAuthValue = {
  session: Session | null;
  admin: AdminMe | null;
  loading: boolean;
  isSysadmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AdminAuthValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  async function resolveAdmin(s: Session | null) {
    if (!s) { setAdmin(null); return; }
    try {
      // GET /admin/me → 200 with the admin record if platform admin, else 403.
      const me = await api.get<AdminMe>('/admin/me');
      setAdmin(me);
    } catch {
      setAdmin(null); // signed in, but not a sysadmin
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await resolveAdmin(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setResolving(true);
      setSession(s);
      await resolveAdmin(s);
      setResolving(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAdmin(null);
  }

  return (
    <Ctx.Provider value={{ session, admin, loading: loading || resolving, isSysadmin: !!admin, signIn, signOut }}>
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
