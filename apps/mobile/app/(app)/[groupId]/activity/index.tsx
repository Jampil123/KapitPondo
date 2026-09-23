import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLedger } from '@/features/reporting/reporting.hooks';
import { ENTRY_LABEL } from '@/features/activity/entryCopy';
import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

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

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ActivityRow({ e, onPress }: { e: LedgerEntry; onPress: () => void }) {
  const credit = e.direction === 'credit';
  const Icon = credit ? ArrowDownRight : ArrowUpRight;
  const copy = ENTRY_LABEL[e.entry_type] ?? (e.description ?? e.entry_type.replace(/_/g, ' '));
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: credit ? '#E2F0E8' : '#F7E5E5', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={credit ? '#3E8E66' : '#C25C5E'} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{copy}</Text>
        <Text variant="caption" color="secondary">
          {e.poster?.full_name ? `by ${e.poster.full_name} · ` : ''}{shortDate(e.posted_at)}
        </Text>
      </View>
      <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13.5, color: credit ? '#3E8E66' : '#C25C5E' }}>
        {credit ? '+' : '-'}{formatPeso(e.amount)}
      </Text>
    </Pressable>
  );
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
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, CARD_SHADOW]}>
            <Text variant="body" color="muted">Nothing here yet.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ paddingTop: 4, paddingBottom: 24, paddingHorizontal: 4 }}>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
            {filtered.map((e, i) => (
              <View key={e.id} style={{ borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <ActivityRow e={e} onPress={() => router.push({ pathname: '/(app)/[groupId]/activity/[entryId]' as any, params: { groupId, entryId: e.id } })} />
              </View>
            ))}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
