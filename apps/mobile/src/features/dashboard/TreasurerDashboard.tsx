import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Wallet, ArrowUpRight, Repeat, Coins, Minus, BarChart3, CalendarClock, ArrowDownRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useSummary, useLedger } from '@/features/reporting/reporting.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useLoans } from '@/features/lending/lending.hooks';

function soon(l: string) { Alert.alert(l, 'Coming soon.'); }
function SectionTitle({ title }: { title: string }) {
  return <Text variant="h3" style={{ fontSize: 15 }}>{title}</Text>;
}

const TONE = {
  accent: { bg: '#EAF2F6', fg: '#5E8497', dot: '#7FA6B8' },
  warn: { bg: '#F8EFDA', fg: '#A87C2C', dot: '#A87C2C' },
} as const;

function StatTile({ icon: Icon, count, label, tone, onPress }: { icon: any; count: number; label: string; tone: keyof typeof TONE; onPress: () => void }) {
  const t = TONE[tone];
  return (
    <Pressable onPress={onPress} style={[{ flex: 1, backgroundColor: semantic.surface, borderRadius: 16, padding: 13 }, shadowToken.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={t.fg} strokeWidth={1.8} />
        </View>
        {count > 0 ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot }} /> : null}
      </View>
      <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, lineHeight: 28 }}>{count}</Text>
      <Text variant="caption" color="secondary" style={{ marginTop: 3, fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}

function Hero({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  return (
    <View style={{ borderRadius: 20, padding: 18, backgroundColor: semantic.brandDark, gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 3 }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.65 }}>Group cash balance</Text>
          {loading ? <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginTop: 6 }} /> : (
            <Text style={{ fontSize: 30, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(data?.available_cash)}</Text>
          )}
        </View>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Wallet size={22} color="#fff" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 12, padding: 11, gap: 2 }}>
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.7 }}>Total contributions</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{formatPeso(data?.total_contributions)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 12, padding: 11, gap: 2 }}>
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.7 }}>Loans outstanding</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>
            {formatPeso(Number(data?.total_loan_disbursements ?? 0) - Number(data?.total_loan_repayments ?? 0))}
          </Text>
        </View>
      </View>
    </View>
  );
}

const ACTIONS: { label: string; icon: any; route?: string; params?: Record<string, string> }[] = [
  { label: 'Record Contribution', icon: ArrowUpRight, route: 'contributions/confirm', params: { tab: 'record' } },
  { label: 'Record Repayment', icon: Repeat, route: 'loans/record-repayment' },
  { label: 'Confirm Disbursement', icon: Coins, route: 'loans/disburse' },
  { label: 'Record Expense', icon: Minus, route: 'expenses/record' },
  { label: 'Year-End Preview', icon: CalendarClock, route: 'distribution/year-end' },
  { label: 'Reports', icon: BarChart3, route: 'reports/group-ledger' },
];

function txnSign(dir: string) { return dir === 'credit' ? '+' : '-'; }

export function TreasurerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string, extraParams?: Record<string, string>) =>
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId, ...extraParams } });

  const pendingContribs = useContributions(groupId, { status: 'submitted' });
  const approvedLoans = useLoans(groupId, { status: 'approved' });
  const ledger = useLedger(groupId, { limit: 5 });

  const contribCount = pendingContribs.data?.length ?? 0;
  const disburseCount = approvedLoans.data?.length ?? 0;
  const repayCount = 0; // no aggregate "repayments to confirm" API yet
  const txns = ledger.data ?? [];

  return (
    <>
      <Hero groupId={groupId} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile icon={ArrowUpRight} count={contribCount} label="Contributions to confirm" tone="accent" onPress={() => go('contributions/confirm', { tab: 'pending' })} />
        <StatTile icon={Repeat} count={repayCount} label="Repayments to confirm" tone="accent" onPress={() => go('loans/record-repayment')} />
        <StatTile icon={Coins} count={disburseCount} label="Disbursements pending" tone="warn" onPress={() => go('loans/disburse')} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ACTIONS.map((a) => (
          <Pressable key={a.label} onPress={() => (a.route ? go(a.route, a.params) : soon(a.label))} style={{ width: '30.5%', alignItems: 'center', gap: 8 }}>
            <View style={[{ width: 62, height: 62, borderRadius: 16, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }, shadowToken.card]}>
              <a.icon size={25} color={semantic.brandDark} strokeWidth={1.8} />
            </View>
            <Text variant="caption" style={{ textAlign: 'center' }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Recent transactions" />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: txns.length ? 6 : 20 }, shadowToken.card]}>
        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} />
        ) : txns.length === 0 ? (
          <Text variant="body" color="muted" style={{ textAlign: 'center' }}>No transactions yet.</Text>
        ) : (
          txns.map((e, i) => {
            const credit = e.direction === 'credit';
            const Icon = credit ? ArrowDownRight : ArrowUpRight;
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < txns.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: credit ? '#E2F0E8' : '#F7E5E5', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={credit ? '#3E8E66' : '#C25C5E'} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
                  <Text variant="caption" color="secondary">{new Date(e.posted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</Text>
                </View>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: credit ? '#3E8E66' : '#C25C5E' }}>{txnSign(e.direction)}{formatPeso(e.amount)}</Text>
              </View>
            );
          })
        )}
      </View>
    </>
  );
}
