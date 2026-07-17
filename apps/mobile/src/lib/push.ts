/**
 * lib/push.ts
 * ----------------------------------------------------------------------------
 * Expo push token registration. SDK 56: remote push is unavailable in Expo Go
 * on Android (has been since SDK 53) — a development build is required there.
 * iOS Simulator (Xcode 14+) and physical devices both work in a dev build.
 *
 * `expo-notifications` throws SYNCHRONOUSLY on import when its native module
 * isn't linked into the running binary (exactly the Expo Go / not-yet-
 * rebuilt-dev-client case above) — a plain top-level `import` would crash the
 * entire app before any of our own code runs. So the module is loaded lazily,
 * inside a try/catch, on first use — everything here degrades to a no-op
 * (push simply isn't available this session) instead of taking the app down.
 * Realtime (see context/NotificationsContext.tsx) covers the app-open case
 * regardless of whether push is available at all.
 *
 * Foreground delivery is intentionally NOT this module's job when push IS
 * available — the realtime subscription already drives the in-app toast +
 * live list update while the app is open. The handler set below tells the OS
 * not to also show its own banner in that case, so the user doesn't see the
 * same event twice. A backgrounded/killed app still gets the OS banner
 * automatically (the OS shows it directly; this handler isn't even invoked).
 */
import { Platform, LogBox } from 'react-native';
import Constants from 'expo-constants';
import { api } from '../api/client';

// expo-modules-core logs this straight to console.error the instant it looks
// up the native module — before our try/catch below ever gets a chance to
// run. It's expected and harmless in Expo Go / a dev build made before this
// dependency was added, so keep it out of the on-screen LogBox overlay; it
// still prints to the terminal.
LogBox.ignoreLogs(["Cannot find native module 'ExpoPushTokenManager'"]);

type NotificationsModule = typeof import('expo-notifications');

// undefined = not attempted yet; null = attempted and unavailable this session.
let cached: NotificationsModule | null | undefined;

function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    cached = mod;
  } catch (e) {
    console.warn(
      '[push] expo-notifications native module unavailable (Expo Go, or a dev build made before this dependency was added) — push disabled for this session; realtime still covers the app-open case.',
      (e as Error).message,
    );
    cached = null;
  }
  return cached;
}

function isRealDevice(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Device = require('expo-device') as typeof import('expo-device');
    return Device.isDevice;
  } catch {
    return false;
  }
}

/** True when running inside the Expo Go app — known-unavailable for remote push on Android since SDK 53, so we skip touching expo-notifications at all rather than reactively catching its failure. */
function isExpoGo(): boolean {
  try {
    return Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
  } catch {
    return false;
  }
}

/**
 * Requests permission, obtains an Expo push token, and registers it with the
 * API. Returns null if unavailable for ANY reason — Expo Go / no dev build
 * yet, simulator, permission denied, no projectId, or any native call
 * failing. The whole body is one try/catch: every step here after
 * loadNotifications() touches the native module, and this function must
 * never throw — realtime already covers the app-open case regardless of
 * whether push ends up available.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (isExpoGo()) return null; // known-unavailable — don't even attempt to touch the native module

  const Notifications = loadNotifications();
  if (!Notifications) return null;

  try {
    if (!isRealDevice()) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    try {
      await api.post('/api/me/push-token', { token, platform: Platform.OS });
    } catch {
      // Non-fatal — realtime still covers the app-open case without this.
    }

    return token;
  } catch (e) {
    console.warn('[push] registration failed (native module likely unavailable this session):', (e as Error).message);
    return null;
  }
}

/** Best-effort cleanup on sign-out so a stale token stops receiving pushes. */
export async function unregisterPushToken(token: string | null) {
  if (!token) return;
  try {
    await api.del('/api/me/push-token', { token });
  } catch {
    // Ignore — the row will just go stale if this fails.
  }
}
