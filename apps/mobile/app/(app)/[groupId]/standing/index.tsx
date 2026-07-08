/**
 * app/(app)/[groupId]/standing/index.tsx — My Standing (member).
 * The "am I okay?" glance: paid-up status, missed cycles, active-loan status,
 * heads/shares. All derived from data already fetched elsewhere — no new
 * endpoints needed. Penalties: no penalties API exists anywhere yet (see
 * penalties.tsx's own header comment), so that section is an honest
 * "not available yet" rather than a fabricated number.
 */
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle2, AlertCircle, Coins, Users, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle, useCycles } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useLoans } from '@/features/lending/lending.hooks';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text variant="body" color="secondary">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

export default function MyStanding() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const cycles = useCycles(groupId!);
  const allContribs = useContributions(groupId!, {});
  const activeLoans = useLoans(groupId!, { status: 'active' });

  const rows = allContribs.data ?? [];
  const thisCycleRows = cycle ? rows.filter((c) => c.cycle_id === cycle.id) : [];
  const paidThisCycle = thisCycleRows.some((c) => c.status === 'approved');

  const closedCycles = (cycles.data ?? []).filter((c) => c.status === 'closed');
  const approvedCycleIds = new Set(rows.filter((c) => c.status === 'approved').map((c) => c.cycle_id));
  const missedMonths = closedCycles.filter((c) => !approvedCycleIds.has(c.id)).length;

  const loading = allContribs.loading || cycles.loading;
  const goodStanding = !loading && paidThisCycle && missedMonths === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="My Standing" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: goodStanding ? '#E2F0E8' : '#F8EFDA', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          {loading ? (
            <ActivityIndicator color={semantic.brand} />
          ) : goodStanding ? (
            <CheckCircle2 size={28} color="#3E8E66" />
          ) : (
            <AlertCircle size={28} color="#A87C2C" />
          )}
          <View style={{ flex: 1 }}>
            <Text variant="label" style={{ fontSize: 15, color: loading ? semantic.textPrimary : goodStanding ? '#3E8E66' : '#A87C2C' }}>
              {loading ? 'Checking your standing…' : goodStanding ? 'Good standing' : 'Needs attention'}
            </Text>
            <Text variant="caption" color="secondary">
              {paidThisCycle ? 'Paid this cycle' : 'Not yet paid this cycle'}
              {missedMonths > 0 ? ` · ${missedMonths} missed cycle${missedMonths === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Coins size={17} color={semantic.brandDark} />
            <Text variant="h3" style={{ fontSize: 15 }}>Active loan</Text>
          </View>
          {activeLoans.loading ? (
            <ActivityIndicator color={semantic.brand} />
          ) : activeLoans.data?.[0] ? (
            <Row label="Outstanding balance" value={formatPeso(activeLoans.data[0].outstanding_balance)} />
          ) : (
            <Text variant="body" color="muted">No active loan.</Text>
          )}
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Users size={17} color={semantic.brandDark} />
            <Text variant="h3" style={{ fontSize: 15 }}>Heads / shares</Text>
          </View>
          <Row label="Heads held" value={String(membership?.heads ?? 1)} />
          <Text variant="caption" color="muted">Drives your year-end share — see Reports.</Text>
        </View>

        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={17} color={semantic.brandDark} />
            <Text variant="h3" style={{ fontSize: 15 }}>Penalties</Text>
          </View>
          <Text variant="body" color="muted">Penalty tracking isn't enabled yet.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
