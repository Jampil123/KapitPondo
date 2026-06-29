/**
 * context/AuthContext.tsx
 * ============================================================================
 * THE AUTH CONTRACT between the foundation (this file) and the screens.
 *
 * Your co-dev's login screens import ONLY `useAuth()` and call these — they
 * never touch Supabase or tokens directly:
 *
 *   const { status, signInWithPhone, verifyOtp } = useAuth();
 *
 *   // Step 1 (phone entry screen): send the code
 *   await signInWithPhone('09171234567');   // accepts 09xx / +63 / 9xx
 *
 *   // Step 2 (code entry screen): verify the 6-digit code → creates session
 *   await verifyOtp('09171234567', '123456');
 *
 *   // Anywhere: read who's logged in and their verification state
 *   const { member } = useAuth();           // member.verification_status etc.
 *
 *   // Sign out
 *   await signOut();
 *
 * `status` drives routing in app/_layout.tsx:
 *   'loading'        → splash
 *   'signedOut'      → redirect to (auth)
 *   'signedIn'       → redirect to (app); use member.verification_status to
 *                      decide whether to nudge the verify-identity screen
 * ============================================================================
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toE164PH } from '../lib/phone';
import { getMyProfile, type Member } from '../api/members';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  member: Member | null;

  /** Step 1: text an OTP to the phone. Accepts 09xx / +63 / 9xx formats. */
  signInWithPhone: (phone: string) => Promise<void>;
  /** Step 2: verify the SMS code; on success a session is created. */
  verifyOtp: (phone: string, token: string) => Promise<void>;
  /** Re-fetch the member profile (e.g. after submitting an ID). */
  refreshMember: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);

  // Load the member profile from our API once a session exists.
  const loadMember = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setMember(null);
      return;
    }
    try {
      const profile = await getMyProfile();
      setMember(profile);
    } catch (e) {
      // A valid session but no member row yet (or API down) — keep them signed
      // in; screens can handle a null member. Don't crash the app.
      console.warn('[auth] could not load member profile', e);
      setMember(null);
    }
  }, []);

  // Bootstrap: read any persisted session, then subscribe to auth changes.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadMember(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      await loadMember(newSession);
      setStatus(newSession ? 'signedIn' : 'signedOut');
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadMember]);

  const signInWithPhone = useCallback(async (phone: string) => {
    const e164 = toE164PH(phone);
    if (!e164) throw new Error('Enter a valid Philippine mobile number.');
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (error) throw error;
  }, []);

  const verifyOtp = useCallback(async (phone: string, token: string) => {
    const e164 = toE164PH(phone);
    if (!e164) throw new Error('Enter a valid Philippine mobile number.');
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token, type: 'sms' });
    if (error) throw error;
    // onAuthStateChange will fire and update session + member.
  }, []);

  const refreshMember = useCallback(async () => {
    await loadMember(session);
  }, [loadMember, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // onAuthStateChange clears session/member and flips status to signedOut.
  }, []);

  const value: AuthContextValue = {
    status,
    session,
    member,
    signInWithPhone,
    verifyOtp,
    refreshMember,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The hook every screen uses. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
