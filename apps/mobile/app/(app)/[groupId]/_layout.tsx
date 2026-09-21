import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { semantic } from '@/theme/colors';
import { PresenceProvider } from '@/context/PresenceContext';
import { GroupNav } from '@/components/shared/GroupNav';
import { activeGroupTab } from '@/components/shared/groupTabs';

export default function GroupLayout() {
  const showNav = activeGroupTab(usePathname()) !== null;

  return (
    <PresenceProvider>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: semantic.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="contributions/contribute" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="loans/repay" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="activity/[entryId]" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
        </View>
        {showNav ? <GroupNav /> : null}
      </View>
    </PresenceProvider>
  );
}
