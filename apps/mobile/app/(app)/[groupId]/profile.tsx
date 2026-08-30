import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar } from '@/components/shared/AppBar';
import { ProfileBody } from '@/features/profile/ProfileBody';

const BAND_TOP = '#4C7C90';

export default function GroupProfile() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Profile" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ProfileBody />
    </SafeAreaView>
  );
}