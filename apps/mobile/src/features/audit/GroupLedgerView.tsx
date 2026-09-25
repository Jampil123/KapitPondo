/**
 * features/audit/GroupLedgerView.tsx
 * ----------------------------------------------------------------------------
 * The read-only group ledger for officers: fund cash with this month's money
 * in/out, type filters, and every posting — tap one for its entry page.
 */
import { useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { ArrowDown, ArrowUp, Undo2, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useFundSummary, useFundLedger } from '@/features/reporting/reporting.hooks';
import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';

type Filter = 'all' | 'contribution' | 'loan_repayment' | 'loan' | 'reversal';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'loan_repayment', label: 'Repayments' },
  { key: 'loan', label: 'Loans' },
  { key: 'reversal', label: 'Reversals' },
];

export const ENTRY_TYPE_LABEL: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Contribution',
  loan_disbursement: 'Loan release',
  loan_repayment: 'Loan repayment',
  distribution: 'Year-end share',
  expense: 'Expense',
  penalty: 'Late penalty',
  fee: 'Fee',
  adjustment: 'Adjustment',
  reversal: 'Reversing entry',
};

function matches(f: Filter, e: LedgerEntry) {
  if (f === 'all') return true;
  if (f === 'loan') return e.entry_type === 'loan_disbursement';
  return e.entry_type === f;
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: semantic.textSecondary }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 1 }} numberOfLines={1}>{formatPeso(value)}</Text>
    </View>
  );
}

function Row({ e, last, onPress }: { e: LedgerEntry; last: boolean; onPress: () => void }) {
  const credit = e.direction === 'credit';
  const reversal = e.entry_type === 'reversal';
  const tone = reversal ? intent.warning : credit ? intent.success : intent.danger;
  const Icon = reversal ? Undo2 : credit ? ArrowDown : ArrowUp;
  const who = e.membership?.members?.full_name ?? e.description ?? 'Group';
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={tone.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{who}</Text>
        <Text style={{ fontSize: 11.5, color: semantic.textSecondary }}>
          {ENTRY_TYPE_LABEL[e.entry_type] ?? e.entry_type.replace(/_/g, ' ')}, {shortDate(e.posted_at)}
        </Text>
        {reversal ? (
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent.info.soft, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 20, marginTop: 5 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: intent.info.strong }} />
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: intent.info.strong }}>Reversal</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: credit ? intent.success.text : semantic.textPrimary }}>
        {credit ? '+' : '−'}{formatPeso(e.amount)}
      </Text>
    </Pressable>
  );
}

export function GroupLedgerView({ groupId, onOpen }: { groupId: string; onOpen: (e: LedgerEntry) => void }) {
  const fund = useFundSummary(groupId);
  const ledger = useFundLedger(groupId, { limit: 1000 });
  const [filter, setFilter] = useState<Filter>('all');
  const entries = useMemo(() => ledger.data ?? [], [ledger.data]);
  const shown = useMemo(() => entries.filter((e) => matches(filter, e)), [entries, filter]);

  const month = useMemo(() => {
    const now = new Date();
    const inMonth = entries.filter((e) => {
      const d = new Date(e.posted_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const sum = (t: LedgerEntryType) => inMonth.filter((e) => e.entry_type === t).reduce((s, e) => s + Number(e.amount), 0);
    return {
      label: now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
      contributions: sum('contribution'),
      repayments: sum('loan_repayment'),
      released: sum('loan_disbursement'),
    };
  }, [entries]);

  return (
    <>
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, marginTop: 14 }, shadowToken.soft]}>
        <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>Fund cash, {month.label}</Text>
        {fund.loading && !fund.data ? (
          <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
        ) : (
          <Text style={{ fontSize: 30, lineHeight: 38, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1 }}>{formatPeso(fund.data?.available_cash ?? 0)}</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
          <Stat label="Contributions in" value={month.contributions} />
          <Stat label="Repayments in" value={month.repayments} />
          <Stat label="Loans released" value={month.released} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4 }}>
        <Lock size={12} color={semantic.textSecondary} />
        <Text style={{ fontSize: 11.5, color: semantic.textSecondary }}>Read-only. Only verified entries appear here.</Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <PillFilters<Filter> options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, marginTop: 12, overflow: 'hidden' }, shadowToken.soft]}>
        {ledger.loading && entries.length === 0 ? (
          <ActivityIndicator color={semantic.brand} style={{ margin: 24 }} />
        ) : shown.length === 0 ? (
          <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>No entries here yet.</Text>
        ) : shown.map((e, i) => (
          <Row key={e.id} e={e} last={i === shown.length - 1} onPress={() => onOpen(e)} />
        ))}
      </View>
    </>
  );
}
