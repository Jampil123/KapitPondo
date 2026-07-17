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
import { API_BASE_URL } from '../api/client';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

// Bump when the Terms/Privacy Policy meaningfully changes — stored on the
// member row so we know which version someone actually agreed to.
export const CONSENT_VERSION = '2026-01-v1';

export interface SignUpInput {
  phone: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthday?: string;
  email?: string;
  /** Must be true — the sign-up screen requires the terms checkbox. */
  consentAccepted: boolean;
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
    console.log('[auth] logged in as', active.user.id, active.user.phone, '— API_BASE_URL =', API_BASE_URL);
    try {
      const profile = await getMyProfile();
      console.log('[auth] loaded member profile', profile);
      setMember(profile);
    } catch (e) {
      console.warn('[auth] could not load member profile', {
        message: (e as Error).message,
        status: (e as any).status,
        code: (e as any).code,
        details: (e as any).details,
      });
      setMember(null);
      // The API rejected our access token (e.g. the account's password/session
      // was revoked server-side) but the local Supabase client doesn't know
      // that yet — it'll happily keep reporting `signedIn` until the token's
      // natural expiry. Force a local sign-out so the UI drops back to login
      // instead of getting stuck showing stale/empty data.
      if ((e as any).status === 401) {
        await supabase.auth.signOut();
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadMember(data.session);
      if (!mounted) return;
      // loadMember may have forced a sign-out (invalid/expired token), which
      // fires its own onAuthStateChange — re-check the CURRENT session rather
      // than trusting this now-possibly-stale reference.
      const { data: fresh } = await supabase.auth.getSession();
      if (!mounted) return;
      setStatus(fresh.session ? 'signedIn' : 'signedOut');
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!mounted) return;
      setSession(s);
      await loadMember(s);
      if (!mounted) return;
      const { data: fresh } = await supabase.auth.getSession();
      if (!mounted) return;
      setStatus(fresh.session ? 'signedIn' : 'signedOut');
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadMember]);

  // The member row loaded above is a snapshot — without this, an admin
  // approving/rejecting identity verification never reaches an already-open
  // app (the "Rejected" banner, verify-now gates, etc. would stay stale until
  // sign-out/sign-in or a manual refetch). RLS already lets a member read
  // their own row (migration 0007); migration 0023 adds it to the realtime
  // publication so it can stream. Every field on the row merges in live —
  // verification_status is the main one, but this covers all of them.
  useEffect(() => {
    const authId = session?.user?.id;
    if (!authId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { session: fresh } } = await supabase.auth.getSession();
      if (cancelled || !fresh) return;
      supabase.realtime.setAuth(fresh.access_token);

      channel = supabase
        .channel(`members:${authId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'members', filter: `auth_id=eq.${authId}` },
          (payload) => {
            setMember((prev) => ({ ...(prev ?? ({} as Member)), ...(payload.new as Member) }));
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const signUp = useCallback(async ({ phone, password, firstName, middleName, lastName, birthday, email, consentAccepted }: SignUpInput) => {
    if (!consentAccepted) throw new Error('You must agree to the Terms & Privacy Policy to continue.');
    const e164 = toE164PH(phone);
    if (!e164) throw new Error('Enter a valid Philippine mobile number.');
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const { error } = await supabase.auth.signUp({
      phone: e164,
      password,
      options: {
        data: {
          full_name: fullName, first_name: firstName, middle_name: middleName ?? null, last_name: lastName,
          birthday: birthday ?? null, email: email ?? null,
          consent_version: CONSENT_VERSION,
        },
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
