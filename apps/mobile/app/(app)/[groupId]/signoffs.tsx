import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic } from '@/theme/colors';
import { VerificationQueue } from '@/features/audit/VerificationQueue';

/**
 * The signed-in officer's own sign-offs (two-step flow, migration 0075) — for
 * the Organizer and Treasurer, whose steps land here from their dashboards.
 * The Auditor's version lives on the Ledger page next to the group ledger.
 */
export default function Signoffs() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Needs your sign-off" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 40 }}>
        <VerificationQueue groupId={groupId!} />
      </ScrollView>
    </SafeAreaView>
  );
}
