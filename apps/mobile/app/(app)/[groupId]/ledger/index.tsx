import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Segmented } from '@/components/ui/Segmented';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic } from '@/theme/colors';
import { VerificationQueue } from '@/features/audit/VerificationQueue';
import { GroupLedgerView } from '@/features/audit/GroupLedgerView';

type Tab = 'queue' | 'ledger';

/** The Auditor's Ledger tab: what's waiting on them, and everything already posted. */
export default function AuditorLedger() {
  const { groupId, tab: initialTab } = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab === 'queue' ? 'queue' : 'ledger');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Ledger" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Segmented<Tab>
          options={[
            { key: 'queue', label: 'Verification queue' },
            { key: 'ledger', label: 'Group ledger' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'queue' ? (
          <VerificationQueue groupId={groupId!} />
        ) : (
          <GroupLedgerView
            groupId={groupId!}
            onOpen={(e) => router.push({ pathname: '/(app)/[groupId]/ledger/[entryId]' as any, params: { groupId, entryId: e.id } })}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
