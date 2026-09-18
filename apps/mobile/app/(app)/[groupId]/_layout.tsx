import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { semantic } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { PresenceProvider } from '@/context/PresenceContext';
import { OrganizerNav } from '@/components/shared/OrganizerNav';
import { TreasurerNav } from '@/components/shared/TreasurerNav';
import { AuditorNav } from '@/components/shared/AuditorNav';
import { MemberNav } from '@/components/shared/MemberNav';

export default function GroupLayout() {
  const { role } = useActiveGroup();
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const hideNav = segments.length > 1;

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
          />
        </View>
        {!hideNav && role === 'owner' && <OrganizerNav />}
        {!hideNav && role === 'treasurer' && <TreasurerNav />}
        {!hideNav && role === 'auditor' && <AuditorNav />}
        {!hideNav && role === 'member' && <MemberNav />}
      </View>
    </PresenceProvider>
  );
}
