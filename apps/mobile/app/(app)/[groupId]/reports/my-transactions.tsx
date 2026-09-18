import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
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

type Category = 'all' | 'contribution' | 'loan_repayment' | 'loan_disbursement';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'loan_repayment', label: 'Loan repayments' },
  { key: 'loan_disbursement', label: 'Disbursements' },
];

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
      {/* Type and name each get their own line — joined on one truncated line
          ("Contribution · Some Very Long Name") cut the name off behind an
          ellipsis; splitting them keeps both fully readable. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>
          {TYPE_LABEL[e.entry_type] ?? e.entry_type}
        </Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2, fontFamily: 'Poppins_600SemiBold' }} numberOfLines={2}>
          {who}
        </Text>
        <Text variant="caption" color="muted" style={{ marginTop: 2 }} numberOfLines={1}>
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
  const [category, setCategory] = useState<Category>('all');

  const mine = useMemo(
    () => (ledger.data ?? []).filter((e) => e.posted_by === member?.id),
    [ledger.data, member?.id],
  );

  // A single blended sum across every entry type is misleading — a loan
  // disbursement is cash LEAVING the fund (debit) while a contribution or
  // repayment is cash coming IN (credit), so adding them together produces a
  // number that means nothing. Split by direction instead.
  const receivedTotal = useMemo(() => mine.filter((e) => e.direction === 'credit').reduce((s, e) => s + Number(e.amount), 0), [mine]);
  const releasedTotal = useMemo(() => mine.filter((e) => e.direction === 'debit').reduce((s, e) => s + Number(e.amount), 0), [mine]);

  const filtered = useMemo(
    () => (category === 'all' ? mine : mine.filter((e) => e.entry_type === category)),
    [mine, category],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of filtered) {
      const key = monthKey(e.posted_at);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({ label: monthLabel(list[0].posted_at), list }));
  }, [filtered]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="My Transactions" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, shadowToken.card]}>
          {ledger.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}>
                <Text variant="overline" color="muted">Received</Text>
                <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: intent.success.text, marginTop: 4 }}>{formatPeso(receivedTotal)}</Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>Contributions + repayments</Text>
              </View>
              <View style={{ flex: 1, paddingLeft: 14, borderLeftWidth: 1, borderColor: semantic.border }}>
                <Text variant="overline" color="muted">Released</Text>
                <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 4 }}>{formatPeso(releasedTotal)}</Text>
                <Text variant="caption" color="muted" style={{ marginTop: 2 }}>Loans disbursed</Text>
              </View>
            </View>
          )}
          <Text variant="caption" color="secondary" style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
            {mine.length} entr{mine.length === 1 ? 'y' : 'ies'} you personally confirmed and pushed to the ledger — not what other officers recorded or approved.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <Pressable key={c.key} onPress={() => setCategory(c.key)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: active ? semantic.dashCard : semantic.surface, borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border }}>
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : grouped.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 16 }, shadowToken.card]}>
            <Text variant="body" color="muted">
              {category === 'all' ? "You haven't confirmed any postings yet." : 'Nothing in this category yet.'}
            </Text>
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
