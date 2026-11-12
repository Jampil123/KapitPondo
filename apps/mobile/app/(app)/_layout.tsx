import { Stack } from 'expo-router';
import { GroupProvider } from '@/context/GroupContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { semantic } from '@/theme/colors';

// A page opened directly (web refresh, link) gets My Groups underneath so Back works.
export const unstable_settings = { initialRouteName: 'groups/index' };

export default function AppLayout() {
  return (
    <NotificationsProvider>
      <GroupProvider>
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
