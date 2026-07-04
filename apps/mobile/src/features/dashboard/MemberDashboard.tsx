/**
 * features/dashboard/MemberDashboard.tsx
 * ----------------------------------------------------------------------------
 * The member's dashboard home, matching the design: a personal contributions
 * hero (my contributions this cycle + progress + mini-stats), a quick-actions
 * grid, and a recent-activity list. Rendered inside DashboardShell (shared
 * greeting header + MemberNav bottom bar are wired in [groupId]/index).
 *
 * Data status:
 *   my contributions / balance → useMyBalance        ✅ real (member-accessible)
 *   per-period amount + cycle  → useActiveCycle       ✅ real
 *   collection progress        → useContributions     ✅ real (approved/total, proxy)
 *   group fund (officer-only)  → NOT shown (RBAC)      → shows "My balance" instead
 *   recent activity            → NO API yet            ⚠️ empty state
 * Quick actions route to member screens that aren't built yet → "Soon".
 */
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpCircle, Coins, Repeat, ScrollText, BarChart3 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useMyBalance } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';


function SectionTitle({ title }: { title: string }) {
  return <Text variant="h3" style={{ fontSize: 15}}>{title}</Text>;
}

function Hero({ groupId }: { groupId: string }) {
  const bal = useMyBalance(groupId);
  const { cycle } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const rows = contribs.data ?? [];
  const approved = rows.filter((c) => c.status === 'approved').length;
  const pct = rows.length ? Math.round((approved / rows.length) * 100) : 0;

  return (
    <View style={{ borderRadius: 20, padding: 18, backgroundColor: semantic.brand, shadowColor: semantic.brand, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 6, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 3 }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>My contributions · this cycle</Text>
          {bal.loading ? (
            <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginTop: 6 }} />
          ) : (
            <Text style={{ fontSize: 30, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: -0.5 }}>{formatPeso(bal.data?.contributions)}</Text>
          )}
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999 }}>
          <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>{cycle?.name ?? 'No cycle'}</Text>
        </View>
      </View>

      <View style={{ gap: 7, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.9 }}>{approved} contribution{approved === 1 ? '' : 's'} approved</Text>
          <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>{pct}%</Text>
        </View>
        <View style={{ height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
          <View style={{ width: (pct + '%') as any, height: '100%', backgroundColor: '#fff', borderRadius: 999 }} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 11, gap: 2 }}>
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.75 }}>My balance</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{formatPeso(bal.data?.balance)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 11, gap: 2 }}>
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.75 }}>Per period</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{cycle ? formatPeso(cycle.contribution_amount) : '—'}</Text>
        </View>
      </View>
    </View>
  );
}

const ACTIONS: { label: string; icon: any; route: string }[] = [
  { label: 'Submit Contribution', icon: ArrowUpCircle, route: 'contributions/contribute' },
  { label: 'Request Loan', icon: Coins, route: 'loans/request' },
  { label: 'Repay Loan', icon: Repeat, route: 'loans/repay' },
  { label: 'My Ledger', icon: ScrollText, route: 'reports/ledger' },
  { label: 'Reports', icon: BarChart3, route: 'reports/ledger' },
];

export function MemberDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });
  return (
    <>
      <Hero groupId={groupId} />

      <SectionTitle title="Quick actions" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ACTIONS.map((a) => (
          <Pressable key={a.label} onPress={() => go(a.route)} style={{ width: '30.5%', alignItems: 'center', gap: 8 }}>
            <View style={[{ width: 62, height: 62, borderRadius: 16, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }, shadowToken.card]}>
              <a.icon size={25} color={semantic.brandDark} strokeWidth={1.8} />
            </View>
            <Text variant="caption" style={{ textAlign: 'center' }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="My activity" />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
        <Text variant="body" color="muted">No recent activity yet.</Text>
      </View>
    </>
  );
}
