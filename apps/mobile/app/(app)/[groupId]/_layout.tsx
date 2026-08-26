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
  // Show the nav bar only on the dashboard's own root screen — every
  // sub-page reached from a dashboard tile, the "+" sheet, or "More" (chat,
  // contributions, fund, standing, profile, etc.) gets the full screen
  // instead of the bar stacking on top of it; its own AppBar back arrow
  // returns to the dashboard. `(app)` is a route GROUP (parens), so it
  // never appears in the resolved pathname — the dashboard root really is
  // just "/<groupId>", one path segment, nothing after it.
  const segments = pathname.split('/').filter(Boolean);
  const hideNav = segments.length > 1;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {/* Opening a dashboard tile/feature (contributions, loans, fund,
            standing, ...) slides in from the right; back/close reverses it —
            set as the default here so every screen under this Stack gets it
            without needing a per-screen override. */}
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
  );
}
