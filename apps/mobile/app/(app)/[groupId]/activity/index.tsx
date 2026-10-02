import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useLedger } from '@/features/reporting/reporting.hooks';
import { signoffLine } from '@/features/activity/entryCopy';
import { LedgerTimeline } from '@/features/activity/LedgerTimeline';
import type { LedgerEntryType } from '@/api/ledger';


type Filter = 'all' | 'contribution' | 'loan' | 'penalty';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'loan', label: 'Loans' },
  { key: 'penalty', label: 'Penalties' },
];

function matchesFilter(f: Filter, type: LedgerEntryType) {
  if (f === 'all') return true;
  if (f === 'loan') return type === 'loan_disbursement' || type === 'loan_repayment';
  return f === type;
}

export default function ActivityFeed() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { membership } = useActiveGroup();
  const [filter, setFilter] = useState<Filter>('all');
  // Officer callers must pass membership_id explicitly, or the ledger route
  // returns the whole group's feed instead of the caller's own activity.
  const ledger = useLedger(groupId!, { membership_id: membership?.id });
  const entries = ledger.data ?? [];
  const filtered = useMemo(() => entries.filter((e) => matchesFilter(filter, e.entry_type)), [entries, filter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Activity" />
      <View style={{ padding: 16, gap: 10, flex: 1 }}>
        <PillFilters<Filter> options={FILTERS} value={filter} onChange={setFilter} />

        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <Text variant="body" color="muted" style={{ paddingVertical: 8, paddingHorizontal: 2 }}>Nothing here yet.</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16, marginTop: 4 }, shadowToken.soft]}>
              <LedgerTimeline
                entries={filtered}
                subtitle={signoffLine}
                onOpen={(e) => router.push({ pathname: '/(app)/[groupId]/activity/[entryId]' as any, params: { groupId, entryId: e.id } })}
              />
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
