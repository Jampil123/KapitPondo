import { Stack } from 'expo-router';
import { semantic } from '@/theme/colors';

// An auth page opened directly (web refresh, link) gets the welcome screen underneath so Back works.
export const unstable_settings = { initialRouteName: 'landing' };

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: semantic.background },
      }}
    />
  );
}
