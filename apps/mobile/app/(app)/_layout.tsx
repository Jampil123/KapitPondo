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
        />
      </GroupProvider>
    </NotificationsProvider>
  );
}
