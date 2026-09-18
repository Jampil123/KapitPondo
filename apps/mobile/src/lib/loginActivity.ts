import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { recordLoginActivity } from '../api/loginActivity';

function currentDeviceLabel(): string {
  const os = Device.osName && Device.osVersion ? `${Device.osName} ${Device.osVersion}` : Device.osName;
  return [Device.modelName, os].filter(Boolean).join(' · ') || Platform.OS;
}

// Called from signin.tsx/otp.tsx right after a real sign-in, not from inside
// AuthContext's signInWithPassword itself — that's also reused by
// change-password.tsx/email-address.tsx to re-verify the current password
// mid-session, which isn't a new login. Wrapped in try/catch (not just a
// promise .catch) because building the device label touches expo-device's
// native constants synchronously, before any promise exists to catch a
// rejection from — a throw there must never surface on top of a real sign-in.
export function recordCurrentLogin() {
  try {
    recordLoginActivity({
      device_label: currentDeviceLabel(),
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version,
    }).catch((e) => console.warn('[auth] could not record login activity:', (e as Error)?.message));
  } catch (e) {
    console.warn('[auth] could not build login activity payload:', (e as Error)?.message);
  }
}
