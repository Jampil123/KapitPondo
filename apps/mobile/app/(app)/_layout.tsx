/**
 * app/(app)/_layout.tsx — stack for the authenticated flow.
 */
import { Stack } from 'expo-router';
import { GroupProvider } from '@/context/GroupContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { semantic } from '@/theme/colors';

export default function AppLayout() {
  return (
    <NotificationsProvider>
      <GroupProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: semantic.background },
          }}
        >
          {/* Bell icon → this route (DashboardHeader.tsx, ProfileBody.tsx) — explicit
              slide so it always animates right-to-left in / left-to-right back out,
              regardless of platform-default push/pop behavior. */}
          <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </GroupProvider>
    </NotificationsProvider>
  );
}
