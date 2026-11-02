import { View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ScrollText, ArrowUpCircle, PiggyBank, HandCoins, CalendarClock, Clock, Download,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ScrollTileRow, type TileAction } from '@/components/shared/ScrollTileRow';
import { DashboardBand, FoldTarget, glassPanel, onBandText } from '@/components/shared/DashboardBand';
import { LedgerTimeline } from '@/features/activity/LedgerTimeline';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useSummary, useLedger } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { CollectionBlock } from './CollectionBlock';
import { PendingActionsCard } from './OrganizerActions';

function SectionHead({ title, aside, tone, onAsidePress, top = 14 }: { title: string; aside?: string; tone?: 'hot' | 'calm'; onAsidePress?: () => void; top?: number }) {
  const color = onAsidePress ? semantic.brandDark : tone === 'hot' ? intent.danger.text : tone === 'calm' ? intent.success.text : semantic.textSecondary;
  const label = aside ? <Text variant="caption" style={{ fontFamily: 'Poppins_600SemiBold', color }}>{aside}</Text> : null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: top }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {label && onAsidePress ? <Pressable onPress={onAsidePress} hitSlop={8}>{label}</Pressable> : label}
    </View>
  );
}

/* ---------------- Cash card: one reconciled statement ---------------- */
function CashRow({ label, amount, tone }: { label: string; amount: number; tone: 'pos' | 'neg' }) {
  const sign = tone === 'pos' ? '+' : '−';
  const color = tone === 'pos' ? intent.success.text : intent.danger.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_700Bold', color }}>{sign}{formatPeso(amount)}</Text>
    </View>
  );
}

function CashCard({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  const { cycle } = useActiveCycle(groupId);

  const contributions = Number(data?.total_contributions ?? 0);
  const repayments = Number(data?.total_loan_repayments ?? 0);
  const disbursed = Number(data?.total_loan_disbursements ?? 0);
  const distributed = Number(data?.total_distributions ?? 0);
  const owedBack = Math.max(0, disbursed - repayments);

  return (
    <View style={{ paddingTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text variant="overline" style={{ color: onBandText }}>Cash on hand</Text>
        {cycle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent.success.soft, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cycle.status === 'active' ? intent.success.base : semantic.textMuted }} />
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: cycle.status === 'active' ? intent.success.text : semantic.textSecondary }}>{cycle.status === 'active' ? 'Active' : cycle.status === 'draft' ? 'Draft' : 'Closed'}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
      ) : (
        <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.7 }}>{formatPeso(data?.available_cash)}</Text>
      )}

      <View style={[glassPanel, { marginTop: 10, padding: 12, gap: 4 }]}>
        <CashRow label="Contributions received" amount={contributions} tone="pos" />
        <CashRow label="Loan repayments received" amount={repayments} tone="pos" />
        <CashRow label="Loans released" amount={disbursed} tone="neg" />
        {distributed > 0 ? <CashRow label="Distributions paid" amount={distributed} tone="neg" /> : null}

        {owedBack > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 7, marginTop: 1, borderTopWidth: 1, borderColor: semantic.border }}>
            <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>Owed back by members</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>{formatPeso(owedBack)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ---------------- This month's collection ---------------- */
/* ---------------- Record grid ---------------- */
const ACTIONS: TileAction[] = [
  { label: 'Contribution', icon: ArrowUpCircle, route: 'contributions/confirm', params: { tab: 'record' } },
  { label: 'Loan Repayment', icon: HandCoins, route: 'loans/record-repayment' },
  { label: 'Transactions', icon: ScrollText, route: 'reports/my-transactions' },
  { label: 'Group Ledger', icon: PiggyBank, route: 'reports/group-ledger' },
  { label: 'Year-End Distribution', icon: CalendarClock, route: 'distribution/year-end' },
  { label: 'Audit Trail', icon: Clock, route: 'audit/log' },
  { label: 'Reports & Export', icon: Download, route: 'reports/export' },
];

/* ---------------- Recent transactions (timeline) ---------------- */
const RECENT_TRANSACTIONS_LIMIT = 3;

function RecentTransactions({ groupId, go }: { groupId: string; go: (route: string, extraParams?: Record<string, string>) => void }) {
  const ledger = useLedger(groupId, { limit: RECENT_TRANSACTIONS_LIMIT });
  const txns = ledger.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16, marginTop: 8 }, shadowToken.soft]}>
      {ledger.loading && txns.length === 0 ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 8 }} />
      ) : txns.length === 0 ? (
        <Text variant="body" color="muted">No transactions yet.</Text>
      ) : (
        <LedgerTimeline
          entries={txns}
          subtitle={(e) => e.membership?.members?.full_name ?? 'Group'}
          onOpen={(e) => go('activity/[entryId]', { entryId: e.id, scope: 'group' })}
        />
      )}
    </View>
  );
}

export function TreasurerHero({ groupId }: { groupId: string }) {
  return (
    <DashboardBand>
      <FoldTarget>
        <CashCard groupId={groupId} />
      </FoldTarget>
    </DashboardBand>
  );
}

export function TreasurerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string, extraParams?: Record<string, string>) =>
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId, ...extraParams } });

  return (
    <>
      <PendingActionsCard groupId={groupId} head={(title, aside, hot) => <SectionHead title={title} aside={aside} tone={hot ? 'hot' : 'calm'} top={6} />} />

      <CollectionBlock groupId={groupId} go={go} head={(title, aside) => <SectionHead title={title} aside={aside} />} />

      <SectionHead title="Records" />
      <ScrollTileRow actions={ACTIONS} go={go} />

      <SectionHead title="Recent transactions" aside="See all" onAsidePress={() => go('reports/my-transactions')} />
      <RecentTransactions groupId={groupId} go={go} />
    </>
  );
}
