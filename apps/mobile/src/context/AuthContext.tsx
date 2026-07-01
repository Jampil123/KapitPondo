/**
 * context/AuthContext.tsx
 * ============================================================================
 * THE AUTH CONTRACT — reconciled to the UI prototype, which uses PHONE +
 * PASSWORD, with OTP confirming the phone number after sign-up.
 *
 *   // Sign up (signup screen): creates the account + texts an OTP to confirm
 *   await signUp({ phone, password, fullName });
 *   // → then route to the OTP screen
 *
 *   // Confirm phone (otp screen): verifies the code, creates the session
 *   await confirmOtp(phone, code);
 *
 *   // Sign in (signin screen): phone + password
 *   await signInWithPassword(phone, password);
 *
 *   // Anywhere
 *   const { status, member } = useAuth();
 *   await signOut();
 *
 * `status` drives routing in app/_layout.tsx:
 *   'loading' → splash · 'signedOut' → (auth) · 'signedIn' → (app)
 *
 * NOTE: if you instead want PASSWORDLESS OTP login (no password), swap
 * signInWithPassword for a signInWithPhone that calls signInWithOtp — the rest
 * is identical. The UI shows passwords, so password is the default here.
 * ============================================================================
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toE164PH } from '../lib/phone';
import { getMyProfile, type Member } from '../api/members';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SignUpInput {
  phone: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthday?: string;
  email?: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  member: Member | null;

  /** Sign up with phone + password; texts an OTP to confirm the phone. */
  signUp: (input: SignUpInput) => Promise<void>;
  /** Confirm the phone with the SMS code; creates a session on success. */
  confirmOtp: (phone: string, token: string) => Promise<void>;
  /** Resend the confirmation code. */
  resendOtp: (phone: string) => Promise<void>;
  /** Sign in with phone + password. */
  signInWithPassword: (phone: string, password: string) => Promise<void>;

  refreshMember: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);

  const loadMember = useCallback(async (active: Session | null) => {
    if (!active) {
      setMember(null);
      return;
    }
    try {
      setMember(await getMyProfile());
    } catch (e) {
      console.warn('[auth] could not load member profile', e);
      setMember(null);
    }
  }, []);

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
    } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!mounted) return;
      setSession(s);
      await loadMember(s);
      setStatus(s ? 'signedIn' : 'signedOut');
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadMember]);

  const signUp = useCallback(async ({ phone, password, firstName, middleName, lastName, birthday, email }: SignUpInput) => {
    const e164 = toE164PH(phone);
    if (!e164) throw new Error('Enter a valid Philippine mobile number.');
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const { error } = await supabase.auth.signUp({
      phone: e164,
      password,
      options: {
        data: { full_name: fullName, first_name: firstName, middle_name: middleName ?? null, last_name: lastName, birthday: birthday ?? null, email: email ?? null },
      },
    });
    if (error) throw error;
  }, []);

  const confirmOtp = useCallback(async (phone: string, token: string) => {
    const e164 = toE164PH(phone);
    if (!e164) throw new Error('Enter a valid Philippine mobile number.');
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token, type: 'sms' });
    if (error) throw error;
    // onAuthStateChange fires → session + member set.
  }, []);

  const resendOtp = useCallback(async (phone: string) => {
    const e164 = toE164PH(phone);
    if (!e164) throw new Error('Enter a valid Philippine mobile number.');
    const { error } = await supabase.auth.resend({ type: 'sms', phone: e164 });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (phone: string, password: string) => {
    const e164 = toE164PH(phone);
    if (!e164) throw new Error('Enter a valid Philippine mobile number.');
    const { error } = await supabase.auth.signInWithPassword({ phone: e164, password });
    if (error) throw error;
  }, []);

  const refreshMember = useCallback(async () => {
    await loadMember(session);
  }, [loadMember, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value: AuthContextValue = {
    status,
    session,
    member,
    signUp,
    confirmOtp,
    resendOtp,
    signInWithPassword,
    refreshMember,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
