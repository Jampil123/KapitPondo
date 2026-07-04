/**
 * app/(app)/[groupId]/profile.tsx — Profile reached from a group's own nav
 * (GroupSheetNav's Profile item). Same account-level content as
 * groups/profile.tsx (shared via ProfileBody), but keeps the GROUP's own nav
 * bar (Chat/Services/+/Profile/More) instead of jumping to the separate
 * account-level Home/Profile bar.
 */
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { ProfileBody } from '@/features/profile/ProfileBody';
import { useActiveGroup } from '@/context/GroupContext';
import { OrganizerNav } from '@/components/shared/OrganizerNav';
import { TreasurerNav } from '@/components/shared/TreasurerNav';
import { AuditorNav } from '@/components/shared/AuditorNav';
import { MemberNav } from '@/components/shared/MemberNav';
import { semantic } from '@/theme/colors';

export default function GroupProfile() {
  const { role } = useActiveGroup();

  if (!role) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background }}>
        <ActivityIndicator color={semantic.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, height: 60, justifyContent: 'center' }}>
        <Text variant="h2" style={{ fontSize: 20 }}>Profile</Text>
      </View>

      <ProfileBody />

      {role === 'owner' ? <OrganizerNav /> : role === 'treasurer' ? <TreasurerNav /> : role === 'auditor' ? <AuditorNav /> : <MemberNav />}
    </SafeAreaView>
  );
}
