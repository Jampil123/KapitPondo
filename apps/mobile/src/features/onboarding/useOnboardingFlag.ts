import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

/**
 * Tutorials are for first-time users only. Accounts created before the
 * tutorials shipped already know the app, so they never see them.
 */
const TUTORIALS_SINCE = Date.parse('2026-11-07T00:00:00Z');

type OnboardingMeta = Record<string, boolean>;

/**
 * Per-account "has seen this tutorial" flag. Stored on the account
 * (auth user_metadata.onboarding) so it holds across devices and reinstalls,
 * with an AsyncStorage copy so it applies instantly offline.
 *
 * `seen` is null while unknown, so callers never flash a tour before the
 * stored value is in. Call `markSeen` as soon as the tour starts — a tour is
 * one-shot, even if the app is closed halfway through it.
 */
export function useOnboardingFlag(name: string) {
  const { session } = useAuth();
  const user = session?.user;
  const key = user ? `onboarding:${name}:${user.id}` : null;
  const fromAccount = !!(user?.user_metadata?.onboarding as OnboardingMeta | undefined)?.[name];
  const existingUser = !!user && Date.parse(user.created_at) < TUTORIALS_SINCE;
  const [cached, setCached] = useState<boolean | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    AsyncStorage.getItem(key)
      .then((v) => alive && setCached(v === '1'))
      .catch(() => alive && setCached(true)); // storage broken → don't nag
    return () => { alive = false; };
  }, [key]);

  const seen: boolean | null = !user ? null : fromAccount || existingUser ? true : cached;

  const markSeen = useCallback(() => {
    if (!key || !user) return;
    setCached(true);
    AsyncStorage.setItem(key, '1').catch(() => {});
    const current = (user.user_metadata?.onboarding as OnboardingMeta | undefined) ?? {};
    if (current[name]) return;
    supabase.auth.updateUser({ data: { onboarding: { ...current, [name]: true } } }).catch(() => {});
  }, [key, user, name]);

  return { seen, markSeen };
}
