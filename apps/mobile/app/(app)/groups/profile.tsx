/**
 * app/(app)/groups/profile.tsx — the account-level Profile page (sibling of
 * index). Reached from the account-level BottomNav (Home/Profile).
 */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { BottomNav } from '@/components/shared/BottomNav';
import { ProfileBody } from '@/features/profile/ProfileBody';
import { semantic } from '@/theme/colors';

export default function Profile() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, height: 60, justifyContent: 'center' }}>
        <Text variant="h2" style={{ fontSize: 20 }}>Profile</Text>
      </View>

      <ProfileBody />

      <BottomNav active="profile" />
    </SafeAreaView>
  );
}
