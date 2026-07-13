/**
 * app/(app)/[groupId]/_layout.tsx — stack for a single group's screens.
 *
 * The role's nav bar is rendered HERE, once, as a persistent sibling next to
 * the Stack — not inside any individual screen. Screens push/pop with their
 * normal transition animation; the nav bar sits outside that animated tree,
 * so it never slides/remounts when navigating between index/profile/etc.
 */
import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { semantic } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { OrganizerNav } from '@/components/shared/OrganizerNav';
import { TreasurerNav } from '@/components/shared/TreasurerNav';
import { AuditorNav } from '@/components/shared/AuditorNav';
import { MemberNav } from '@/components/shared/MemberNav';

export default function GroupLayout() {
  const { role } = useActiveGroup();
  const pathname = usePathname();
  // Chat is a full-page screen (its own composer sits at the true bottom of
  // the screen) — the role nav bar is suppressed there instead of stacking
  // on top of it.
  const hideNav = pathname.includes('/chat/');

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
      {!hideNav && role === 'owner' && <OrganizerNav />}
      {!hideNav && role === 'treasurer' && <TreasurerNav />}
      {!hideNav && role === 'auditor' && <AuditorNav />}
      {!hideNav && role === 'member' && <MemberNav />}
    </View>
  );
}
