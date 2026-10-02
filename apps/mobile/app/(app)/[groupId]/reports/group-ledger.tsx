import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpRight, ArrowDownRight, Receipt, Search, Flag } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useQuery } from '@/hooks/useApi';
import { listFlags } from '@/api/flags';
import { useFundSummary, useFundLedger, useFundTotals } from '@/features/reporting/reporting.hooks';
import { signoffLine } from '@/features/activity/entryCopy';
import { entryRef, type LedgerEntry, type LedgerEntryType } from '@/api/ledger';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type Filter = 'all' | 'contribution' | 'loan_repayment' | 'loan_disbursement' | 'flagged';

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
  withdrawal: 'Withdrawal payout',
};

const COMPOSITION_LABEL: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Contributions received',
  loan_repayment: 'Loan repayments received',
  penalty: 'Penalties received',
  distribution: 'Year-end shares paid',
  loan_disbursement: 'Loans released',
  expense: 'Expenses paid',
  withdrawal: 'Withdrawals paid out',
};

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
}
function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function iconTone(e: LedgerEntry): { bg: string; fg: string; Icon: any } {
  if (e.entry_type === 'expense') return { bg: intent.warning.soft, fg: intent.warning.text, Icon: Receipt };
  if (e.direction === 'credit') return { bg: intent.success.soft, fg: intent.success.text, Icon: ArrowDownRight };
  return { bg: semantic.surfaceAlt, fg: semantic.brandDark, Icon: ArrowUpRight };
}

function Row({ e, mine, flagged, onPress }: { e: LedgerEntry; mine: boolean; flagged: boolean; onPress: () => void }) {
  const tone = iconTone(e);
  const credit = e.direction === 'credit';
  const who = e.membership?.members?.full_name ?? (e.entry_type === 'expense' ? 'Group' : null);
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: semantic.border, ...(mine ? { backgroundColor: semantic.surfaceAlt, marginHorizontal: -8, paddingHorizontal: 10 } : null) }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <tone.Icon size={16} color={tone.fg} />
      </View>
      {/* Type and name each get their own line, and nothing here is capped
          to one line with an ellipsis — this ledger is the group's
          transparency record, so a long member name or a long "confirmed
          by" name should wrap instead of hiding behind "...". */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>
            {TYPE_LABEL[e.entry_type] ?? e.entry_type}
          </Text>
          {mine ? (
            <View style={{ backgroundColor: semantic.brandDark, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 20 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: '#fff' }}>You</Text>
            </View>
          ) : null}
          {flagged ? <Flag size={12} color={intent.danger.text} fill={intent.danger.text} /> : null}
        </View>
        {who ? (
          <Text variant="caption" color="secondary" style={{ marginTop: 2, fontFamily: 'Poppins_500Medium' }}>{who}</Text>
        ) : null}
        <Text variant="caption" color="muted" style={{ marginTop: 2, lineHeight: 15 }}>
          {[shortDate(e.posted_at), signoffLine(e)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: credit ? intent.success.text : semantic.textPrimary, marginTop: 1 }}>
        {credit ? '+' : '−'}{formatPeso(e.amount)}
      </Text>
    </Pressable>
  );
}

const COMPOSITION_ORDER: LedgerEntryType[] = ['contribution', 'loan_repayment', 'penalty', 'distribution', 'loan_disbursement', 'withdrawal', 'expense', 'adjustment', 'reversal', 'fee'];

/** Signed per-type totals → the summary card's breakdown rows, in a fixed order. */
function compositionRows(sums: Partial<Record<LedgerEntryType, number>>) {
  return COMPOSITION_ORDER
    .filter((t) => sums[t] != null)
    .map((t) => ({ label: COMPOSITION_LABEL[t] ?? (TYPE_LABEL[t] ?? t), v: sums[t]!, pos: sums[t]! >= 0 }));
}

function SummaryCard({ cash, loading, postings, rows, footnote }: {
  cash: number; loading: boolean; postings: number;
  rows: { label: string; v: number; pos: boolean }[]; footnote?: string | null;
}) {
  return (
    <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Cash on hand</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent.success.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: intent.success.base }} />
          <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>{postings} postings</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
      ) : (
        <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(cash)}</Text>
      )}
      {rows.length > 0 ? (
        <View style={{ marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: 'rgba(42,62,75,0.1)', gap: 8 }}>
          {rows.map((row) => (
            <View key={row.label} style={{ flexDirection: 'row' }}>
              <Text variant="caption" color="secondary">{row.label}</Text>
              <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: row.pos ? intent.success.text : intent.danger.text }}>
                {row.pos ? '+' : '−'}{formatPeso(Math.abs(row.v))}
              </Text>
            </View>
          ))}
          {footnote ? <Text variant="caption" color="muted" style={{ lineHeight: 15 }}>{footnote}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function MonthTotal({ label, moneyIn, moneyOut, balance }: { label: string; moneyIn: number; moneyOut: number; balance: number }) {
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 16, padding: 14, marginTop: 10 }, CARD_SHADOW]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text variant="overline" color="muted">{label}</Text>
        <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_700Bold' }}>Balance {formatPeso(balance)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowDownRight size={15} color={intent.success.text} />
          </View>
          <View>
            <Text variant="caption" color="secondary">Money in</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>+{formatPeso(moneyIn)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowUpRight size={15} color={semantic.brandDark} />
          </View>
          <View>
            <Text variant="caption" color="secondary">Money out</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>−{formatPeso(moneyOut)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Members see totals only — per type and per month — with no member names or individual postings. */
function MemberGroupLedger({ groupId }: { groupId: string }) {
  const fund = useFundSummary(groupId);
  const totals = useFundTotals(groupId);
  const cash = Number(fund.data?.available_cash ?? 0);

  // Month-end balances walked backward from today's cash on hand (months arrive newest first).
  const months = useMemo(() => {
    let bal = cash;
    return (totals.data?.by_month ?? []).map((m) => {
      const [y, mo] = m.month.split('-').map(Number);
      const row = { key: m.month, label: new Date(y, mo - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }), moneyIn: m.money_in, moneyOut: m.money_out, balance: bal };
      bal -= m.money_in - m.money_out;
      return row;
    });
  }, [totals.data, cash]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SummaryCard cash={cash} loading={fund.loading} postings={totals.data?.postings ?? 0} rows={compositionRows(totals.data?.by_type ?? {})} />
      <Text variant="overline" color="muted" style={{ marginTop: 20, marginLeft: 2 }}>By month</Text>
      {totals.loading && !totals.data ? (
        <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
      ) : months.length === 0 ? (
        <View style={[{ backgroundColor: semantic.card, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 10 }, CARD_SHADOW]}>
          <Text variant="body" color="muted">No postings yet.</Text>
        </View>
      ) : (
        months.map((m) => <MonthTotal key={m.key} label={m.label} moneyIn={m.moneyIn} moneyOut={m.moneyOut} balance={m.balance} />)
      )}
    </ScrollView>
  );
}

export default function GroupLedger() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { role } = useActiveGroup();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Group Ledger" />
      {role === 'member' ? <MemberGroupLedger groupId={groupId!} /> : <OfficerGroupLedger groupId={groupId!} />}
    </SafeAreaView>
  );
}

function OfficerGroupLedger({ groupId }: { groupId: string }) {
  const { membership, role } = useActiveGroup();
  const router = useRouter();
  const fund = useFundSummary(groupId);
  // Flags are Auditor/Organizer-only on the API, so the Treasurer gets no Flagged chip.
  const canSeeFlags = role === 'auditor' || role === 'owner';
  const flagsFn = useCallback(() => (canSeeFlags ? listFlags(groupId, 'open') : Promise.resolve([])), [groupId, canSeeFlags]);
  const flags = useQuery(flagsFn, [groupId, canSeeFlags], canSeeFlags ? { table: 'audit_flags', filter: `group_id=eq.${groupId}` } : null);
  const flaggedNos = useMemo(() => new Set((flags.data ?? []).map((f) => f.record?.entry_no).filter((n): n is number => n != null)), [flags.data]);
  const isFlagged = (e: LedgerEntry) => e.entry_no != null && flaggedNos.has(e.entry_no);
  // Explicit, generous limit — the default server-side cap (300) is fine for
  // a young group, but this page's breakdown is summed
  // from exactly what's fetched (see composition below), so once a
  // long-running group crosses that cap, that total would silently stop
  // matching "Cash on hand" above it with no indication why. A member
  // reading a transparency ledger for discrepancies deserves either the
  // real total or an explicit note that it's partial — never a silent one.
  // Supabase's PostgREST layer caps any single request at 1000 rows
  // (supabase/config.toml's db.max_rows) regardless of what's asked for, so
  // this is the real ceiling — requesting more would just be a silent lie.
  const LEDGER_FETCH_LIMIT = 1000;
  const ledger = useFundLedger(groupId, { limit: LEDGER_FETCH_LIMIT });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const entries = ledger.data ?? [];
  const possiblyTruncated = entries.length >= LEDGER_FETCH_LIMIT;

  // Running balance walked backward from the current cash on hand — entries
  // arrive newest-first, so entries[0]'s balance IS available_cash, and each
  // earlier entry's balance is the one after it minus that later entry's effect.
  const withBalance = useMemo(() => {
    let bal = Number(fund.data?.available_cash ?? 0);
    return entries.map((e) => {
      const row = { e, balance: bal };
      bal -= e.direction === 'credit' ? Number(e.amount) : -Number(e.amount);
      return row;
    });
  }, [entries, fund.data?.available_cash]);

  const q = search.trim().toLowerCase();
  const filtered = withBalance.filter(({ e }) => {
    if (filter === 'flagged' ? !isFlagged(e) : filter !== 'all' && e.entry_type !== filter) return false;
    if (!q) return true;
    return [e.membership?.members?.full_name, TYPE_LABEL[e.entry_type], e.description, entryRef(e), e.entry_no != null ? String(1000 + e.entry_no) : null]
      .some((v) => v?.toLowerCase().includes(q));
  });

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const key = monthKey(row.e.posted_at);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, list]) => ({ label: monthLabel(list[0].e.posted_at), balance: list[0].balance, list }));
  }, [filtered]);

  const cash = Number(fund.data?.available_cash ?? 0);

  // Derived from the entries actually fetched, not group_summary() — that RPC
  // only breaks out 5 of the 9 entry_types (nothing for penalty/adjustment/
  // reversal/fee), so a group with any of those would show a composition
  // that visibly didn't add up to its own total. Summing what's on screen
  // guarantees these rows always reconcile with the total right below them.
  const composition = useMemo(() => {
    const sums: Partial<Record<LedgerEntryType, number>> = {};
    for (const e of entries) {
      sums[e.entry_type] = (sums[e.entry_type] ?? 0) + (e.direction === 'credit' ? 1 : -1) * Number(e.amount);
    }
    return compositionRows(sums);
  }, [entries]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'contribution', label: 'Contributions' },
    { key: 'loan_repayment', label: 'Loan repayments' },
    { key: 'loan_disbursement', label: 'Loan release' },
    ...(canSeeFlags ? [{ key: 'flagged' as const, label: 'Flagged' }] : []),
  ];

  return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Summary ---------------- */}
        <SummaryCard
          cash={cash} loading={fund.loading} postings={entries.length} rows={composition}
          footnote={possiblyTruncated ? `Showing the most recent ${LEDGER_FETCH_LIMIT.toLocaleString()} postings — this group has more, so the breakdown above may not match cash on hand exactly.` : null}
        />

        {/* ---------------- Search + filters ---------------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 14, paddingHorizontal: 14, height: 46, marginTop: 14 }}>
          <Search size={16} color={semantic.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search member, entry or reference no."
            placeholderTextColor={semantic.textMuted}
            autoCorrect={false}
            style={{ flex: 1, fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}
          />
        </View>
        <View style={{ marginTop: 10 }}>
          <PillFilters<Filter> options={FILTERS} value={filter} onChange={setFilter} />
        </View>

        {/* ---------------- Postings, grouped by month ---------------- */}
        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : grouped.length === 0 ? (
          <View style={[{ backgroundColor: semantic.card, borderRadius: 16, padding: 24, alignItems: 'center', marginTop: 16 }, CARD_SHADOW]}>
            <Text variant="body" color="muted">{q ? 'No postings match your search.' : 'No postings match this filter.'}</Text>
          </View>
        ) : (
          grouped.map((g) => (
            <View key={g.label}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 9, marginLeft: 2 }}>
                <Text variant="overline" color="muted">{g.label}</Text>
                <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_700Bold' }}>Balance {formatPeso(g.balance)}</Text>
              </View>
              <View>
                {g.list.map(({ e }) => (
                  <Row
                    key={e.id} e={e} mine={e.membership_id === membership?.id} flagged={isFlagged(e)}
                    onPress={() => router.push({ pathname: '/(app)/[groupId]/ledger/[entryId]' as any, params: { groupId, entryId: e.id } })}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
  );
}
