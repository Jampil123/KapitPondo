import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { semantic } from '@/theme/colors';
import { PresenceProvider } from '@/context/PresenceContext';
import { GroupNav } from '@/components/shared/GroupNav';
import { activeGroupTab } from '@/components/shared/groupTabs';

export default function GroupLayout() {
  // Only the dashboard shows the bottom nav; Chat, Profile and More open as their own pages with a back button.
  const showNav = activeGroupTab(usePathname()) === 'home';

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
            <Stack.Screen name="messages" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="more" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="contributions/contribute" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="loans/repay" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="loans/request" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="contributions/record" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="loans/record" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="activity/[entryId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="owner-activity/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="audit/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="audit/proof/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="audit/flag/[id]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="ledger/[entryId]" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="audit/new-finding" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="loans/repayments/index" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="loans/repayments/[paymentId]" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
        </View>
        {/* Slides away as a tab page slides in, and back up on return to the dashboard. */}
        {showNav ? (
          <Animated.View
            entering={SlideInDown.duration(260)}
            exiting={SlideOutDown.duration(200)}
            // Floats over the dashboard with a transparent backdrop; only the pill and + button catch touches.
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
          >
            <GroupNav />
          </Animated.View>
        ) : null}
      </View>
    </PresenceProvider>
  );
}
