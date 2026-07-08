/**
 * app/(app)/[groupId]/activity/index.tsx — Activity feed (member).
 * Built directly from the member's own ledger feed rather than merging
 * separate contributions/loans lists — the ledger already captures every
 * posted financial event (contribution, loan disbursement/repayment, penalty,
 * expense, distribution) in one place, self-scoped to the caller, with a real
 * timestamp. `posted_by` is always the approving officer (see the SQL RPCs),
 * now joined to a name in reporting.service.js, so this is a real "who did
 * this, when" feed — not a fabricated one.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLedger } from '@/features/reporting/reporting.hooks';
import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';

type Filter = 'all' | 'contribution' | 'loan' | 'penalty';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'loan', label: 'Loans' },
  { key: 'penalty', label: 'Penalties' },
];

const ACTION_COPY: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Your contribution was approved',
  loan_disbursement: 'Your loan was approved & disbursed',
  loan_repayment: 'Your repayment was recorded',
  penalty: 'A penalty was applied',
  distribution: 'Your year-end share was paid out',
  expense: 'A group expense was posted',
};

function matchesFilter(f: Filter, type: LedgerEntryType) {
  if (f === 'all') return true;
  if (f === 'loan') return type === 'loan_disbursement' || type === 'loan_repayment';
  return f === type;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ActivityRow({ e }: { e: LedgerEntry }) {
  const credit = e.direction === 'credit';
  const Icon = credit ? ArrowDownRight : ArrowUpRight;
  const copy = ACTION_COPY[e.entry_type] ?? (e.description ?? e.entry_type.replace(/_/g, ' '));
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: credit ? '#E2F0E8' : '#F7E5E5', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={credit ? '#3E8E66' : '#C25C5E'} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ fontSize: 13 }}>{copy}</Text>
        <Text variant="caption" color="secondary">
          {e.poster?.full_name ? `by ${e.poster.full_name} · ` : ''}{shortDate(e.posted_at)}
        </Text>
      </View>
      <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13.5, color: credit ? '#3E8E66' : '#C25C5E' }}>
        {credit ? '+' : '-'}{formatPeso(e.amount)}
      </Text>
    </View>
  );
}

export default function ActivityFeed() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [filter, setFilter] = useState<Filter>('all');
  const ledger = useLedger(groupId!, {});
  const entries = ledger.data ?? [];
  const filtered = useMemo(() => entries.filter((e) => matchesFilter(filter, e.entry_type)), [entries, filter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Activity" subtitle="Member" />
      <View style={{ padding: 16, gap: 14, flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Text
                key={f.key}
                onPress={() => setFilter(f.key)}
                variant="caption"
                style={{
                  paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
                  backgroundColor: active ? semantic.brand : semantic.surfaceAlt,
                  color: active ? '#fff' : semantic.textSecondary,
                  fontWeight: active ? '600' : '400',
                  overflow: 'hidden',
                }}
              >
                {f.label}
              </Text>
            );
          })}
        </ScrollView>

        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
            <Text variant="body" color="muted">Nothing here yet.</Text>
          </View>
        ) : (
          <ScrollView>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 6 }, shadowToken.card]}>
              {filtered.map((e, i) => (
                <View key={e.id} style={{ borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                  <ActivityRow e={e} />
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
