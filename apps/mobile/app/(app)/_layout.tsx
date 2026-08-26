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
        {/* Every screen at this level (groups list, notifications, a group's own
            [groupId] stack, ...) slides in from the right and back out to the
            right on close/back by default — was only set per-screen for
            notifications before; now every push/pop here is consistent
            regardless of platform-default behavior. */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: semantic.background },
            animation: 'slide_from_right',
          }}
        />
      </GroupProvider>
    </NotificationsProvider>
  );
}
