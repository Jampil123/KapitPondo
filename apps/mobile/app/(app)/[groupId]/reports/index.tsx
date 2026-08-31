import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpRight, ArrowDownRight, FileDown } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { shareCsv } from '@/lib/csv';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { buildTimeline, periodLabel, type PeriodKind } from '@/features/contributions/periods';
import { useMyBalance, useFundSummary, useLedger } from '@/features/reporting/reporting.hooks';
import { useLoans } from '@/features/lending/lending.hooks';
import { useMyPenalties } from '@/features/penalties/penalties.hooks';
import type { LedgerEntry, LedgerEntryType } from '@/api/ledger';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type Period = 'cycle' | 'all';

function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function Split({ items }: { items: { k: string; v: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: semantic.border }}>
      {items.map((it, i) => (
        <View key={it.k} style={{ flex: 1, paddingLeft: i > 0 ? 14 : 0, borderLeftWidth: i > 0 ? 1 : 0, borderColor: semantic.border }}>
          <Text variant="overline" color="muted">{it.k}</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }}>{it.v}</Text>
        </View>
      ))}
    </View>
  );
}

const KIND_TONE: Record<PeriodKind, string> = {
  paid: intent.success.base,
  review: intent.info.base,
  rejected: intent.danger.base,
  late: intent.danger.base,
  due: semantic.surfaceAlt,
  upcoming: semantic.surfaceAlt,
};

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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={credit ? intent.success.text : semantic.brandDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{copy}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
          {shortDate(e.posted_at)}{e.poster?.full_name ? ` · verified by ${e.poster.full_name}` : ''}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: credit ? intent.success.text : semantic.textPrimary }}>
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

  const contribs = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const myContribRows = contribs.data ?? [];
  const timeline = useMemo(() => (cycle ? buildTimeline(cycle, myContribRows, heads) : []), [cycle, myContribRows, heads]);

  const posted = timeline.filter((p) => p.kind === 'paid');
  const awaiting = timeline.filter((p) => p.kind === 'review');
  const owed = timeline.filter((p) => p.kind !== 'paid' && p.kind !== 'review');
  const postedTotal = posted.reduce((s, p) => s + p.amount, 0);
  const awaitingTotal = awaiting.reduce((s, p) => s + p.amount, 0);
  const owedTotal = owed.reduce((s, p) => s + p.amount, 0);
  const committedTotal = postedTotal + awaitingTotal + owedTotal;

  const balAll = useMyBalance(groupId!);
  const capitalAllTime = Number(balAll.data?.contributions ?? 0);
  const capital = period === 'cycle' ? postedTotal : capitalAllTime;

  const ledger = useLedger(groupId!, { membership_id: membership?.id });
  const entriesAll = ledger.data ?? [];
  const entries = useMemo(
    () => (period === 'cycle' && cycle ? entriesAll.filter((e) => e.cycle_id === cycle.id) : entriesAll),
    [entriesAll, period, cycle],
  );

  const loans = useLoans(groupId!, {});
  const outstandingLoan = (loans.data ?? []).filter((l) => l.status === 'active').reduce((s, l) => s + Number(l.outstanding_balance), 0);

  const penalties = useMyPenalties(groupId!, 'pending');
  const unsettledPenalty = (penalties.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const fund = useFundSummary(groupId!);
  const totalHeads = Number(fund.data?.total_heads ?? 0);
  const availableCash = Number(fund.data?.available_cash ?? 0);
  const myShareEstimate = totalHeads > 0 ? availableCash * (heads / totalHeads) : 0;

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

  const loading = contribs.loading || balAll.loading || ledger.loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="My reports" subtitle={`${group?.name ?? 'Group'} · ${cycle?.name ?? 'No active cycle'}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Summary ---------------- */}
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>My money in the fund</Text>
            <View style={{ backgroundColor: semantic.surfaceAlt, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>{period === 'cycle' ? (cycle?.name ?? 'This cycle') : 'All time'}</Text>
            </View>
          </View>
          {loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(capital)}</Text>
          )}
          <Split items={
            period === 'cycle'
              ? [{ k: 'Periods posted', v: `${posted.length} of ${timeline.length || '—'}` }, { k: 'My heads', v: String(heads) }]
              : [{ k: 'My heads', v: String(heads) }]
          } />
        </View>
        <Text variant="caption" color="muted" style={{paddingTop: 11,lineHeight: 16, textAlign: 'justify'}}>Capital you've put in — returned to you when the cycle closes</Text>

        {/* ---------------- Period toggle ---------------- */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {(['cycle', 'all'] as Period[]).map((p) => {
            const active = period === p;
            return (
              <Pressable key={p} onPress={() => setPeriod(p)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: active ? semantic.dashCard : semantic.surface, borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border }}>
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{p === 'cycle' ? 'This cycle' : 'All time'}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ---------------- Where my money sits ---------------- */}
        {cycle && timeline.length > 0 ? (
          <>
            <SectionHead title="Where my money sits" />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
              <View style={{ flexDirection: 'row', height: 11, borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
                {postedTotal > 0 ? <View style={{ width: `${(postedTotal / committedTotal) * 100}%`, backgroundColor: intent.success.base }} /> : null}
                {awaitingTotal > 0 ? <View style={{ width: `${(awaitingTotal / committedTotal) * 100}%`, backgroundColor: intent.info.base }} /> : null}
                {owedTotal > 0 ? <View style={{ width: `${(owedTotal / committedTotal) * 100}%`, backgroundColor: semantic.surfaceAlt }} /> : null}
              </View>
              <View style={{ gap: 10 }}>
                {[
                  { color: intent.success.base, label: 'Posted to the ledger', v: postedTotal },
                  { color: intent.info.base, label: 'Waiting to be verified', v: awaitingTotal },
                  { color: semantic.textMuted, label: 'Still owed this cycle', v: owedTotal },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: row.color }} />
                    <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{row.label}</Text>
                    <Text style={{ marginLeft: 'auto', fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(row.v)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
                <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_700Bold' }}>Committed this cycle</Text>
                <Text style={{ marginLeft: 'auto', fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(committedTotal)}</Text>
              </View>
            </View>

            {/* ---------------- Month by month ---------------- */}
            <SectionHead title="Period by period" aside={`${formatPeso(cycle.contribution_amount)} × ${heads} expected`} />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
              {/* Bars and labels are separate rows, each with their own fixed height —
                  a bar at 100% filling one shared 90px box with its label stacked on
                  top of it (via gap) has no room left for the label and overflows. */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 70 }}>
                {timeline.map((p) => {
                  const heightPct = p.kind === 'paid' || p.kind === 'review' ? 100 : p.kind === 'late' || p.kind === 'rejected' ? 4 : 14;
                  return (
                    <View key={p.index} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                      <View style={{ width: '100%', height: `${heightPct}%`, minHeight: 4, borderRadius: 3, backgroundColor: KIND_TONE[p.kind] }} />
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 6 }}>
                {timeline.map((p) => (
                  <View key={p.index} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>
                      {periodLabel(p.periodStart, cycle.frequency, true).slice(0, 1)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text variant="caption" color="secondary" style={{ marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border, lineHeight: 17 }}>
                Green periods are posted, blue is under review, red is late or returned.
              </Text>
            </View>
          </>
        ) : null}

        {/* ---------------- If the cycle closed today ---------------- */}
        <SectionHead title="If the cycle closed today" aside="Estimate" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text variant="body" color="secondary" style={{ fontSize: 12.5 }}>Your estimated share · {heads} of {totalHeads || '—'} heads</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 19, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, letterSpacing: -0.4 }}>{formatPeso(myShareEstimate)}</Text>
          </View>

          {outstandingLoan > 0 || unsettledPenalty > 0 ? (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border, gap: 8 }}>
              {outstandingLoan > 0 ? (
                <View style={{ flexDirection: 'row' }}>
                  <Text variant="caption" color="secondary">Loan still outstanding</Text>
                  <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: intent.danger.text }}>{formatPeso(outstandingLoan)}</Text>
                </View>
              ) : null}
              {unsettledPenalty > 0 ? (
                <View style={{ flexDirection: 'row' }}>
                  <Text variant="caption" color="secondary">Unsettled penalty</Text>
                  <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: intent.danger.text }}>{formatPeso(unsettledPenalty)}</Text>
                </View>
              ) : null}
              <Text variant="caption" color="muted" style={{ lineHeight: 16 }}>
                These aren't subtracted above — a year-end share and your other balances with the group are separate.
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: 12, backgroundColor: intent.warning.soft, borderRadius: 12, padding: 12 }}>
            <Text variant="caption" style={{ color: intent.warning.text, lineHeight: 17 }}>
              This is an estimate based on the fund's cash on hand right now, split by heads — the same math the Owner runs at year-end. It moves as the fund does, and isn't final until the Owner distributes.
            </Text>
          </View>
        </View>

        {/* ---------------- My statement ---------------- */}
        <SectionHead title="My statement" aside="From my side" />
        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 10 }} />
        ) : entries.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, CARD_SHADOW]}>
            <Text variant="body" color="muted">No entries yet.</Text>
          </View>
        ) : (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
            {entries.slice(0, 4).map((e) => <StatementRow key={e.id} e={e} />)}
            <Pressable onPress={() => router.push({ pathname: '/(app)/[groupId]/activity' as any, params: { groupId } })} style={{ paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>
                {entries.length > 4 ? `See all ${entries.length} entries` : 'See full activity'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ---------------- Export ---------------- */}
        <SectionHead title="Download" />
        <Pressable
          onPress={onExport}
          disabled={exporting || entries.length === 0}
          style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, opacity: exporting || entries.length === 0 ? 0.6 : 1 }, CARD_SHADOW]}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            {exporting ? <ActivityIndicator color={semantic.brandDark} /> : <FileDown size={20} color={semantic.brandDark} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>Statement CSV</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{period === 'cycle' ? 'This cycle' : 'All time'} · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}, ready to open in Excel or Sheets</Text>
          </View>
        </Pressable>

        <Text variant="caption" color="secondary" style={{ marginTop: 16, lineHeight: 17, paddingHorizontal: 2 }}>
          These figures come from postings an officer has verified. Anything still under review is marked separately and isn't counted as capital yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
