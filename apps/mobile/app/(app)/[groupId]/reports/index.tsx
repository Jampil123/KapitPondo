import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpRight, ArrowDownRight, FileDown, Repeat, AlertTriangle, PiggyBank } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { FilterTabs } from '@/components/shared/FilterTabs';
import { GrowthChart, MONTH_SHORT } from '@/components/shared/GrowthChart';
import { semantic, intent, type IntentName, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { shareCsv } from '@/lib/csv';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { buildTimeline } from '@/features/contributions/periods';
import { useMyBalance, useFundSummary, useLedger } from '@/features/reporting/reporting.hooks';
import { useLoans } from '@/features/lending/lending.hooks';
import { useMyPenalties } from '@/features/penalties/penalties.hooks';
import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';


type Period = 'cycle' | 'all';

function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function GroupLabel({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9, marginHorizontal: 2 }}>
      <Text variant="overline" color="muted" style={{ letterSpacing: 0.8 }}>{title}</Text>
      {aside ? <Text variant="caption" color="muted">{aside}</Text> : null}
    </View>
  );
}

function BreakdownRow({ Icon, tone, title, sub, value, valueColor, last }: {
  Icon: any; tone: IntentName; title: string; sub: string; value: string; valueColor?: string; last?: boolean;
}) {
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={t.text} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>{sub}</Text>
      </View>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: valueColor ?? semantic.textPrimary }}>{value}</Text>
    </View>
  );
}

const ACTION_COPY: Partial<Record<LedgerEntryType, string>> = {
  contribution: 'Monthly contribution',
  loan_disbursement: 'Loan received',
  loan_repayment: 'Loan repayment',
  penalty: 'Late penalty',
  distribution: 'Year-end share',
  expense: 'Group expense',
};

function StatementRow({ e }: { e: LedgerEntry }) {
  const credit = e.direction === 'credit';
  const Icon = credit ? ArrowDownRight : ArrowUpRight;
  const copy = ACTION_COPY[e.entry_type] ?? (e.description ?? e.entry_type.replace(/_/g, ' '));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: semantic.border }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={credit ? intent.success.text : semantic.brandDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{copy}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {shortDate(e.posted_at)}{e.poster?.full_name ? ` · verified by ${e.poster.full_name}` : ''}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: credit ? intent.success.text : semantic.textPrimary }}>
        {credit ? '+' : '−'}{formatPeso(e.amount)}
      </Text>
    </View>
  );
}

export default function Reports() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { group, membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const heads = membership?.heads ?? 1;
  const [period, setPeriod] = useState<Period>('cycle');
  const [exporting, setExporting] = useState(false);

  // Officers get every member's rows back from these endpoints, so scope to my own membership.
  const contribs = useContributions(groupId!, { ...(cycle?.id ? { cycle_id: cycle.id } : {}), membership_id: membership?.id });
  const myContribRows = useMemo(
    () => (contribs.data ?? []).filter((c) => c.membership_id === membership?.id),
    [contribs.data, membership?.id],
  );
  const timeline = useMemo(() => (cycle ? buildTimeline(cycle, myContribRows, heads) : []), [cycle, myContribRows, heads]);

  const postedCount = timeline.filter((p) => p.kind === 'paid').length;
  const postedTotal = timeline.filter((p) => p.kind === 'paid').reduce((s, p) => s + p.amount, 0);

  const balAll = useMyBalance(groupId!);
  const capital = period === 'cycle' ? postedTotal : Number(balAll.data?.contributions ?? 0);

  const ledger = useLedger(groupId!, { membership_id: membership?.id });
  const entries = useMemo(() => {
    const mine = (ledger.data ?? []).filter((e) => e.membership_id === membership?.id);
    if (period !== 'cycle' || !cycle) return mine;
    // Loan disbursements/repayments are posted without a cycle_id, so fall back to the posting date for those.
    const start = new Date(cycle.start_date).getTime();
    const end = cycle.end_date ? new Date(cycle.end_date).getTime() + 86400000 : Infinity;
    return mine.filter((e) => {
      if (e.cycle_id) return e.cycle_id === cycle.id;
      const t = new Date(e.posted_at).getTime();
      return t >= start && t < end;
    });
  }, [ledger.data, membership?.id, period, cycle]);

  const growth = useMemo(() => {
    const contribs = entries.filter((e) => e.entry_type === 'contribution');
    const first = period === 'cycle' && cycle
      ? new Date(cycle.start_date)
      : contribs.reduce<Date | null>((d, e) => { const t = new Date(e.posted_at); return !d || t < d ? t : d; }, null);
    if (!first) return [];
    const now = new Date();
    const months: { key: number; label: string; value: number }[] = [];
    for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now && months.length < 24; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      months.push({ key: d.getFullYear() * 12 + d.getMonth(), label: MONTH_SHORT[d.getMonth()], value: 0 });
    }
    for (const e of contribs) {
      const t = new Date(e.posted_at);
      const m = months.find((x) => x.key === t.getFullYear() * 12 + t.getMonth());
      if (m) m.value += Number(e.amount);
    }
    const thisMonth = months[months.length - 1]?.value ?? 0;
    let run = 0;
    return months.map((m) => ({ label: m.label, value: (run += m.value), thisMonth }));
  }, [entries, period, cycle]);
  const addedThisMonth = growth[growth.length - 1]?.thisMonth ?? 0;

  // Straight from the loan itself, not the ledger — same math as the Loans page.
  const loans = useLoans(groupId!, {});
  const activeLoans = (loans.data ?? []).filter((l) => l.membership_id === membership?.id && l.status === 'active');
  const outstandingLoan = activeLoans.reduce((s, l) => s + Number(l.outstanding_balance), 0);
  const borrowed = activeLoans.reduce((s, l) => s + Number(l.approved_principal ?? l.principal), 0);
  const repaid = Math.max(0, borrowed - outstandingLoan);

  const penalties = useMyPenalties(groupId!, 'pending');
  const unsettledPenalty = (penalties.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const fund = useFundSummary(groupId!);
  const totalHeads = Number(fund.data?.total_heads ?? 0);
  // Whole fund = cash on hand + money out on loan (same total as the dashboard), split per head, times my heads.
  const cash = Number(fund.data?.available_cash ?? 0);
  const onLoan = Math.max(0, Number(fund.data?.total_loan_disbursements ?? 0) - Number(fund.data?.total_loan_repayments ?? 0));
  const perHead = totalHeads > 0 ? (cash + onLoan) / totalHeads : 0;
  const myShareEstimate = perHead * heads;

  async function onExport() {
    setExporting(true);
    try {
      const rows: (string | number)[][] = [['Date', 'Entry', 'Direction', 'Amount', 'Verified by']];
      for (const e of entries) {
        rows.push([shortDate(e.posted_at), ACTION_COPY[e.entry_type] ?? e.entry_type, e.direction, e.amount, e.poster?.full_name ?? '']);
      }
      const label = period === 'cycle' ? (cycle?.name ?? 'this-cycle') : 'all-time';
      await shareCsv(`${(group?.name ?? 'kapitpondo').replace(/\s+/g, '-')}-statement-${label}.csv`, rows);
    } catch (e) {
      Alert.alert('Could not export', (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const loading = contribs.loading || balAll.loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="My reports" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Period toggle ---------------- */}
        <FilterTabs<Period>
          options={[{ key: 'cycle', label: 'This cycle' }, { key: 'all', label: 'All time' }]}
          value={period}
          onChange={setPeriod}
        />

        {/* ---------------- Contributed + growth chart ---------------- */}
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16, marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text variant="overline" color="muted">Contributed</Text>
              <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8, marginTop: 2 }}>
                {loading ? '…' : formatPeso(capital)}
              </Text>
            </View>
            {addedThisMonth > 0 ? (
              <View style={{ backgroundColor: intent.success.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, marginTop: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: intent.success.text }}>+{formatPeso(addedThisMonth)} this month</Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" color="secondary" style={{ marginTop: 4 }}>
            {heads} head{heads === 1 ? '' : 's'}
            {period === 'cycle' && timeline.length > 0 ? ` · ${postedCount} of ${timeline.length} periods posted` : ''}
          </Text>
          {growth.length > 0 ? (
            <View style={{ marginTop: 14 }}>
              <GrowthChart points={growth} />
            </View>
          ) : null}
        </View>

        {/* ---------------- Loans, penalties, share ---------------- */}
        <GroupLabel title="Breakdown" />
        <View style={[{ backgroundColor: semantic.card, borderRadius: 18, overflow: 'hidden' }, shadowToken.soft]}>
          <BreakdownRow
            Icon={Repeat} tone={outstandingLoan > 0 ? 'danger' : 'neutral'}
            title="Loan still owed"
            sub={activeLoans.length > 0 ? `Borrowed ${formatPeso(borrowed)} · repaid ${formatPeso(repaid)}` : 'No active loan'}
            value={formatPeso(outstandingLoan)}
            valueColor={outstandingLoan > 0 ? intent.danger.text : semantic.textMuted}
          />
          <BreakdownRow
            Icon={AlertTriangle} tone={unsettledPenalty > 0 ? 'danger' : 'neutral'}
            title="Unsettled penalties"
            sub={unsettledPenalty > 0 ? `${penalties.data?.length ?? 0} pending` : 'None'}
            value={formatPeso(unsettledPenalty)}
            valueColor={unsettledPenalty > 0 ? intent.danger.text : semantic.textMuted}
          />
          <BreakdownRow
            Icon={PiggyBank} tone="success"
            title="Estimated share"
            sub={`${formatPeso(perHead)} per head × ${heads} head${heads === 1 ? '' : 's'}`}
            value={formatPeso(myShareEstimate)}
            last
          />
        </View>

        {/* ---------------- My statement ---------------- */}
        <GroupLabel title="My statement" aside={entries.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : undefined} />
        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 10 }} />
        ) : entries.length === 0 ? (
          <Text variant="body" color="muted" style={{ paddingVertical: 8, paddingHorizontal: 2 }}>No entries yet.</Text>
        ) : (
          <View>
            {entries.slice(0, 4).map((e) => <StatementRow key={e.id} e={e} />)}
            <Pressable onPress={() => router.push({ pathname: '/(app)/[groupId]/activity' as any, params: { groupId } })} style={{ paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>
                {entries.length > 4 ? `See all ${entries.length} entries` : 'See full activity'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ---------------- Export ---------------- */}
        <Pressable
          onPress={onExport}
          disabled={exporting || entries.length === 0}
          style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: semantic.border, opacity: exporting || entries.length === 0 ? 0.5 : 1 }}
        >
          {exporting ? <ActivityIndicator color={semantic.brandDark} /> : <FileDown size={17} color={semantic.brandDark} />}
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>Download statement (CSV)</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
