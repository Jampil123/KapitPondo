/**
 * app/(auth)/_layout.tsx — stack for the unauthenticated flow.
 */
import { Stack } from 'expo-router';
import { semantic } from '@/theme/colors';

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
