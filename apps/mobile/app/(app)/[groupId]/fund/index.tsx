/**
 * app/(app)/[groupId]/fund/index.tsx — Fund overview (member).
 * The transparency centerpiece: members contribute, so they can see the fund.
 * Uses the new member-safe /reports/fund-summary endpoint (aggregate-only —
 * same fields the officer-only /reports/summary already exposes, just gated
 * to members too) plus the existing member-accessible cycle-progress RPC for
 * the collection %.
 */
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Wallet, TrendingUp, TrendingDown, Percent } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveCycle, useCycleProgress } from '@/features/cycles/cycles.hooks';
import { useFundSummary } from '@/features/reporting/reporting.hooks';

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={[{ flex: 1, backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 8 }, shadowToken.card]}>
      <Icon size={18} color={semantic.brandDark} />
      <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{value}</Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </View>
  );
}

export default function FundOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { cycle } = useActiveCycle(groupId!);
  const summary = useFundSummary(groupId!);
  const progress = useCycleProgress(groupId!, cycle?.id);

  const pct = progress.data?.percent_collected ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Fund" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: semantic.brand, borderRadius: 18, padding: 18, gap: 6, shadowColor: semantic.brand, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 6 }]}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.7 }}>Available fund balance</Text>
          {summary.loading ? (
            <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start' }} />
          ) : (
            <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{formatPeso(summary.data?.available_cash)}</Text>
          )}
        </View>

        <Text variant="h3" style={{ fontSize: 15 }}>This cycle</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat label="Collected" value={formatPeso(progress.data?.collected_total)} icon={TrendingUp} />
          <Stat label="Expected" value={formatPeso(progress.data?.expected_total)} icon={Percent} />
        </View>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 8 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" color="secondary">Collection progress</Text>
            <Text variant="caption" style={{ fontWeight: '600' }}>{pct}%</Text>
          </View>
          <View style={{ height: 7, borderRadius: 999, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: semantic.brand, borderRadius: 999 }} />
          </View>
        </View>

        <Text variant="h3" style={{ fontSize: 15 }}>Fund breakdown</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat label="Loans disbursed" value={formatPeso(summary.data?.total_loan_disbursements)} icon={TrendingDown} />
          <Stat label="Loans repaid" value={formatPeso(summary.data?.total_loan_repayments)} icon={TrendingUp} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat label="Expenses" value={formatPeso(summary.data?.total_expenses)} icon={TrendingDown} />
          <Stat label="Active loans pending" value={String(summary.data?.pending_loans ?? 0)} icon={Wallet} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
