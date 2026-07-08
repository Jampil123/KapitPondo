/**
 * app/(app)/[groupId]/reports/index.tsx — Reports: year-end share + lifetime
 * totals (member). Distinct from reports/ledger.tsx (kept as-is, reachable
 * from More). The year-end preview endpoint was already member-accessible,
 * but leaked every member's allocation — now privacy-fixed server-side
 * (distributions.service.js's getAllocations scopes to the caller when
 * role === 'member'), so this page only ever sees the caller's own row.
 */
import { useMemo } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Gift, ScrollText } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useDistributions, useDistribution } from '@/features/distribution/distribution.hooks';
import { useLedger } from '@/features/reporting/reporting.hooks';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 6 }, shadowToken.card]}>
      <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{value}</Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </View>
  );
}

export default function Reports() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const distributions = useDistributions(groupId!);
  // Already newest-first from the API — the most recent distribution (if any).
  const latest = distributions.data?.[0] ?? null;
  const detail = useDistribution(groupId!, latest?.id);
  const myAllocation = detail.data?.allocations?.[0] ?? null;

  const ledger = useLedger(groupId!, {});
  const entries = ledger.data ?? [];
  const totals = useMemo(() => {
    const sum = (type: string) => entries.filter((e) => e.entry_type === type).reduce((s, e) => s + Number(e.amount), 0);
    return {
      contributed: sum('contribution'),
      borrowed: sum('loan_disbursement'),
      repaid: sum('loan_repayment'),
    };
  }, [entries]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Reports" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 10 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Gift size={17} color={semantic.brandDark} />
            <Text variant="h3" style={{ fontSize: 15 }}>Year-end share</Text>
          </View>
          {distributions.loading || detail.loading ? (
            <ActivityIndicator color={semantic.brand} />
          ) : !latest ? (
            <Text variant="body" color="muted">No year-end distribution has been run yet.</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="body" color="secondary">{latest.period}</Text>
                <StatusBadge entity="distribution" value={latest.status} />
              </View>
              <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>
                {myAllocation ? formatPeso(myAllocation.amount) : '—'}
              </Text>
              <Text variant="caption" color="muted">
                Capital returned + net income (interest + penalties − expenses), shared by heads.
                {latest.status === 'previewed' ? ' This is a preview — not yet finalized.' : ''}
              </Text>
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ScrollText size={17} color={semantic.brandDark} />
          <Text variant="h3" style={{ fontSize: 15 }}>Lifetime totals</Text>
        </View>
        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Stat label="Total contributed" value={formatPeso(totals.contributed)} />
              <Stat label="Total borrowed" value={formatPeso(totals.borrowed)} />
            </View>
            <Stat label="Total repaid" value={formatPeso(totals.repaid)} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
