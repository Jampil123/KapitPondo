/**
 * context/NotificationsContext.tsx
 * ----------------------------------------------------------------------------
 * Single source of truth for the Notification Center. Fetches the list once
 * on sign-in, then keeps it live via a Supabase Realtime subscription on
 * `notifications` (INSERT, filtered to the signed-in member — RLS + the
 * realtime publication entry from migration 0022 authorize this). A new row
 * prepends into state, pops a brief in-app toast, and updates the unread
 * count everywhere at once (dashboard bell dot, Notification Center list) —
 * no polling, no manual refresh.
 *
 * Also owns Expo push-token registration: once signed in, this device
 * registers for push so admin actions still reach the user while the app is
 * backgrounded/killed. The realtime path above — not the OS push banner —
 * is what drives the foreground experience (see lib/push.ts).
 */
import {
  createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode,
} from 'react';
import { View, Animated, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../components/ui/Text';
import { semantic, shadowToken } from '../theme/colors';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, type Notification,
} from '../api/notifications';
import { registerForPushNotificationsAsync, unregisterPushToken } from '../lib/push';

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const TOAST_VISIBLE_MS = 3200;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { member } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [toast, setToast] = useState<Notification | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushTokenRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!member) { setNotifications([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const list = await listNotifications({ limit: 100 });
      setNotifications(list);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [member]);

  useEffect(() => { refetch(); }, [refetch]);

  function showToast(n: Notification) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(n);
    toastAnim.setValue(0);
    Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, TOAST_VISIBLE_MS);
  }

  function dismissToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.timing(toastAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setToast(null));
  }

  // Realtime: stream new rows in as they're inserted — this IS the "instant,
  // no refresh needed" behavior while the app is open.
  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // The websocket's own auth doesn't always pick up the current session
      // automatically — bind it explicitly so the RLS policy on `notifications`
      // (migration 0022) actually authorizes this subscription. Confirmed via
      // a live test: without this line, the channel subscribes "successfully"
      // but silently never receives a row.
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`notifications:${member.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${member.id}` },
          (payload) => {
            const row = payload.new as Notification;
            setNotifications((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]));
            showToast(row);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  // Push registration follows the same session lifecycle. Never allowed to
  // throw here — push.ts already degrades to a no-op when the native module
  // isn't available, but this is a second line of defense so a push failure
  // can never take the rest of the app down with it.
  useEffect(() => {
    if (!member) {
      if (pushTokenRef.current) unregisterPushToken(pushTokenRef.current);
      pushTokenRef.current = null;
      return;
    }
    registerForPushNotificationsAsync()
      .then((token) => { pushTokenRef.current = token; })
      .catch((e) => console.warn('[notifications] push registration failed', (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const markRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (e) {
      console.warn('[notifications] markRead failed', (e as Error).message);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) {
      console.warn('[notifications] markAllRead failed', (e as Error).message);
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, loading, error, refetch, markRead, markAllRead }}>
      {children}
      {toast ? (
        <Animated.View
          style={[
            {
              position: 'absolute', top: 54, left: 16, right: 16, zIndex: 50,
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
            },
          ]}
        >
          <Pressable
            onPress={() => { dismissToast(); router.push('/(app)/notifications' as any); }}
            style={[
              { backgroundColor: semantic.surface, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10 },
              shadowToken.card,
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ fontSize: 14 }}>{toast.title ?? 'Notification'}</Text>
              {toast.message ? <Text variant="bodySmall" color="secondary" numberOfLines={2}>{toast.message}</Text> : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within <NotificationsProvider>');
  return ctx;
}
