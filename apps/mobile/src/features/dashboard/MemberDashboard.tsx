/**
 * features/dashboard/MemberDashboard.tsx
 * ----------------------------------------------------------------------------
 * The member's dashboard home: a personal contributions hero, a ledger-first
 * quick-actions grid (destinations that show the full record, not one-shot
 * verb forms — see MemberDashboard_Transparency_Plan.md), and a recent-activity
 * preview. Rendered inside DashboardShell (shared greeting header + MemberNav
 * bottom bar are wired in [groupId]/index).
 *
 * Data status:
 *   my contributions / balance → useMyBalance        ✅ real (member-accessible)
 *   per-period amount + cycle  → useActiveCycle       ✅ real
 *   collection progress        → useContributions     ✅ real (approved/total, proxy)
 *   group fund (officer-only)  → NOT shown (RBAC)      → shows "My balance" instead
 *   recent activity            → useLedger (real)      last 3 entries, "See all" → Activity
 * Grid tiles: Contributions/Loans/Fund/Standing/Group/Activity/Reports/More
 * all route to real pages now (Phases 1–4).
 */
import { Alert, View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowUpCircle, Coins, PiggyBank, BadgeCheck, Users, History, BarChart3, MoreHorizontal,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useMyBalance, useLedger, useFundSummary } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';

function SectionTitle({ title }: { title: string }) {
  return <Text variant="h3" style={{ fontSize: 15}}>{title}</Text>;
}

/** Next occurrence of the cycle's contribution date, derived from start_date + frequency — real, not fabricated (no due_date column exists). */
function nextDueDate(cycle: { start_date: string; frequency: string } | null): string | null {
  if (!cycle) return null;
  const d = new Date(cycle.start_date);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  while (d < now) {
    if (cycle.frequency === 'weekly') d.setDate(d.getDate() + 7);
    else if (cycle.frequency === 'biweekly') d.setDate(d.getDate() + 14);
    else if (cycle.frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
    else d.setMonth(d.getMonth() + 1); // monthly
  }
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function Hero({ groupId }: { groupId: string }) {
  const { membership } = useActiveGroup();
  const bal = useMyBalance(groupId);
  const fund = useFundSummary(groupId);
  const { cycle } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  // listContributions only self-scopes server-side when role === 'member' — for
  // an officer viewing their own Member tab it returns the whole group's rows,
  // so filter here to guarantee this only ever reflects the caller's own.
  const rows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);
  const approved = rows.filter((c) => c.status === 'approved').length;
  const pct = rows.length ? Math.round((approved / rows.length) * 100) : 0;

  return (
    <View style={{ borderRadius: 20, padding: 18, backgroundColor: semantic.brand, shadowColor: semantic.brand, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 6, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 3 }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Your contributions · this cycle</Text>
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
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.75 }}>Group fund</Text>
          {fund.loading ? (
            <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start' }} />
          ) : (
            <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{formatPeso(fund.data?.available_cash)}</Text>
          )}
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 11, gap: 2 }}>
          <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.75 }}>Next due</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{nextDueDate(cycle) ?? '—'}</Text>
        </View>
      </View>
    </View>
  );
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function RecentActivity({ groupId, onSeeAll }: { groupId: string; onSeeAll: () => void }) {
  const { membership } = useActiveGroup();
  // The ledger route honors a caller-supplied membership_id for officers (unlike
  // contributions/loans lists, which ignore it) — pass it explicitly so this
  // stays "my own activity" instead of the whole group's feed for officers.
  const ledger = useLedger(groupId, { limit: 3, membership_id: membership?.id });
  const entries = ledger.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: entries.length ? 6 : 20 }, shadowToken.card]}>
      {ledger.loading ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 14 }} />
      ) : entries.length === 0 ? (
        <Text variant="body" color="muted" style={{ textAlign: 'center' }}>No recent activity yet.</Text>
      ) : (
        <>
          {entries.map((e, i) => {
            const credit = e.direction === 'credit';
            const Icon = credit ? ArrowDownRight : ArrowUpRight;
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: credit ? '#E2F0E8' : '#F7E5E5', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={credit ? '#3E8E66' : '#C25C5E'} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="label" style={{ fontSize: 12.5 }} numberOfLines={1}>{e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
                  <Text variant="caption" color="secondary">{shortDate(e.posted_at)}</Text>
                </View>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13, color: credit ? '#3E8E66' : '#C25C5E' }}>
                  {credit ? '+' : '-'}{formatPeso(e.amount)}
                </Text>
              </View>
            );
          })}
          <Pressable onPress={onSeeAll} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '600' }}>See all activity</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const ACTIONS: ({ label: string; icon: any } & ({ route: string } | { soon: true }))[] = [
  { label: 'Contributions', icon: ArrowUpCircle, route: 'contributions' },
  { label: 'Loans', icon: Coins, route: 'loans' },
  { label: 'Fund', icon: PiggyBank, route: 'fund' },
  { label: 'My Standing', icon: BadgeCheck, route: 'standing' },
  { label: 'Group & Officers', icon: Users, route: 'group' },
  { label: 'Activity', icon: History, route: 'activity' },
  { label: 'Reports', icon: BarChart3, route: 'reports' },
  { label: 'More', icon: MoreHorizontal, route: 'more' },
];

export function MemberDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });

  function onTilePress(a: (typeof ACTIONS)[number]) {
    if ('soon' in a) return void Alert.alert(a.label, 'Coming soon.');
    go(a.route);
  }

  return (
    <>
      <Hero groupId={groupId} />

      <View style={{ gap: 14 }}>
        {chunk(ACTIONS, 4).map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {row.map((a) => (
              <Pressable key={a.label} onPress={() => onTilePress(a)} style={{ width: '22%', alignItems: 'center', gap: 6 }}>
                <View style={[{ width: 54, height: 54, borderRadius: 16, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }, shadowToken.card]}>
                  <a.icon size={22} color={semantic.brandDark} strokeWidth={1.8} />
                </View>
                <Text variant="caption" style={{ textAlign: 'center', fontSize: 10.5, lineHeight: 13 }} numberOfLines={2}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <SectionTitle title="My activity" />
      <RecentActivity groupId={groupId} onSeeAll={() => go('activity')} />
    </>
  );
}
