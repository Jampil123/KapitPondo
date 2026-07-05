/**
 * app/(app)/[groupId]/_layout.tsx — stack for a single group's screens.
 *
 * The role's nav bar is rendered HERE, once, as a persistent sibling next to
 * the Stack — not inside any individual screen. Screens push/pop with their
 * normal transition animation; the nav bar sits outside that animated tree,
 * so it never slides/remounts when navigating between index/profile/etc.
 */
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { semantic } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { OrganizerNav } from '@/components/shared/OrganizerNav';
import { TreasurerNav } from '@/components/shared/TreasurerNav';
import { AuditorNav } from '@/components/shared/AuditorNav';
import { MemberNav } from '@/components/shared/MemberNav';

export default function GroupLayout() {
  const { role } = useActiveGroup();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: semantic.background },
          }}
        />
      </View>
      {role === 'owner' && <OrganizerNav />}
      {role === 'treasurer' && <TreasurerNav />}
      {role === 'auditor' && <AuditorNav />}
      {role === 'member' && <MemberNav />}
    </View>
  );
}
