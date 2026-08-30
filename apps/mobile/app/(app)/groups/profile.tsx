/**
 * app/(app)/groups/profile.tsx — the account-level Profile page (sibling of
 * index). Reached from the Home dashboard's avatar tap. Header matches
 * [groupId]/profile.tsx's treatment — the AppBar colored the same as
 * ProfileBody's gradient band, so it blends into it instead of showing a
 * plain white bar on top. No bottom nav here, same as the Home dashboard.
 */
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar } from '@/components/shared/AppBar';
import { ProfileBody } from '@/features/profile/ProfileBody';

// Matches the top color of ProfileBody's gradient band.
const BAND_TOP = '#4C7C90';

export default function Profile() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Profile" backgroundColor={BAND_TOP} tintColor="#fff" />

      <ProfileBody />
    </SafeAreaView>
  );
}
