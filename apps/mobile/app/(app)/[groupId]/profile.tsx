/**
 * app/(app)/[groupId]/profile.tsx — Profile reached from a group's own nav
 * (GroupSheetNav's Profile item). Same account-level content as
 * groups/profile.tsx (shared via ProfileBody). The group's nav bar itself is
 * rendered persistently by [groupId]/_layout.tsx, not here.
 *
 * This is an off-nav screen (not one of the bar's own tabs), so it needs its
 * own back arrow — AppBar's default `back` — to return to the dashboard.
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar } from '@/components/shared/AppBar';
import { ProfileBody } from '@/features/profile/ProfileBody';
import { semantic } from '@/theme/colors';

export default function GroupProfile() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Profile" />
      <ProfileBody />
    </SafeAreaView>
  );
}