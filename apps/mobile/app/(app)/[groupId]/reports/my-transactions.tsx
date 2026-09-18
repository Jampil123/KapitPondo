import { useMemo } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useLedger } from '@/features/reporting/reporting.hooks';
import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';

const TYPE_LABEL: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan released',
  loan_repayment: 'Loan repayment',
  distribution: 'Year-end share',
  expense: 'Expense',
  penalty: 'Late penalty',
  fee: 'Fee',
  adjustment: 'Adjustment',
  reversal: 'Reversal',
};

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}
function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function Row({ e }: { e: LedgerEntry }) {
  const credit = e.direction === 'credit';
  const Icon = credit ? ArrowDownRight : ArrowUpRight;
  const who = e.membership?.members?.full_name ?? 'Group';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={credit ? intent.success.text : semantic.brandDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>
          {TYPE_LABEL[e.entry_type] ?? e.entry_type} · {who}
        </Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>
          {shortDate(e.posted_at)}{e.description ? ` · ${e.description}` : ''}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: credit ? intent.success.text : semantic.textPrimary }}>
        {credit ? '+' : '−'}{formatPeso(e.amount)}
      </Text>
    </View>
  );
}

/** Every ledger entry the Treasurer themselves confirmed/posted — not the
 * full group ledger (see reports/group-ledger.tsx for that), and not "my
 * own contributions" (that's ledger_entries.membership_id, a different
 * field) — this is specifically their own officer activity: what THEY
 * approved and pushed to the ledger. */
export default function MyTransactions() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { member } = useAuth();
  const ledger = useLedger(groupId!, { limit: 500 });

  const mine = useMemo(
    () => (ledger.data ?? []).filter((e) => e.posted_by === member?.id),
    [ledger.data, member?.id],
  );

  const totalPosted = useMemo(() => mine.reduce((s, e) => s + Number(e.amount), 0), [mine]);

  const grouped = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of mine) {
      const key = monthKey(e.posted_at);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({ label: monthLabel(list[0].posted_at), list }));
  }, [mine]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="My Transactions" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, shadowToken.card]}>
          <Text variant="overline" color="muted">Total you've posted</Text>
          {ledger.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
          ) : (
            <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(totalPosted)}</Text>
          )}
          <Text variant="caption" color="secondary" style={{ marginTop: 6 }}>{mine.length} entr{mine.length === 1 ? 'y' : 'ies'} you confirmed</Text>
        </View>

        <Text variant="caption" color="muted" style={{ lineHeight: 16, marginTop: 12 }}>
          Every posting you personally confirmed and pushed to the ledger — not what other officers recorded or approved.
        </Text>

        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : grouped.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 16 }, shadowToken.card]}>
            <Text variant="body" color="muted">You haven't confirmed any postings yet.</Text>
          </View>
        ) : (
          grouped.map((g) => (
            <View key={g.label}>
              <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>{g.label}</Text>
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
                {g.list.map((e) => <Row key={e.id} e={e} />)}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
