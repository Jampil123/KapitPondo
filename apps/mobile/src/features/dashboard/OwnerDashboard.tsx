import { View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@/hooks/useApi';
import {
  Users, Coins, AlertTriangle, SlidersHorizontal, UserCheck, CalendarClock,
  Wallet, ScrollText, Receipt,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { periodsSinceStart } from '@/lib/cycle';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { useLoans } from '@/features/lending/lending.hooks';
import { useActiveCycle, useCycleProgress } from '@/features/cycles/cycles.hooks';
import { listPendingMembers } from '@/api/groups';

/* ---- Fund hero (their FundCard, accent bg + cycle pill) ---- */
function FundHero({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  const { cycle } = useActiveCycle(groupId);
  const { data: progress } = useCycleProgress(groupId, cycle?.id);

  const percent = progress?.percent_collected ?? 0;
  const month = cycle ? periodsSinceStart(cycle.start_date, cycle.frequency) : null;

  return (
    <View
      style={{
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 16,
        backgroundColor: semantic.dashCard,
        shadowColor: semantic.brandDark,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.4,
        shadowRadius: 30,
        elevation: 6,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 3 }}>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Total group fund</Text>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginTop: 6 }} />
          ) : (
            <Text style={{ fontSize: 30, fontFamily: 'Poppins_700Bold', color: '#fff', letterSpacing: -0.5 }}>
              {formatPeso(data?.available_cash)}
            </Text>
          )}
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999 }}>
          <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>{cycle?.name ?? 'No active cycle'}</Text>
        </View>
      </View>

      {cycle ? (
        <View style={{ marginTop: 14, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" style={{ color: '#fff', opacity: 0.9 }}>
              Month {month} · monthly {formatPeso(cycle.contribution_amount)}
            </Text>
            <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>{percent}% collected</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.min(100, Math.max(0, percent))}%`, borderRadius: 3, backgroundColor: '#fff' }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/* ---- Action-required stat tile (their StatTile) ---- */
type Tone = 'accent' | 'warn' | 'danger';
const TONE: Record<Tone, { bg: string; fg: string; dot: string }> = {
  accent: { bg: '#EAF2F6', fg: '#5E8497', dot: '#7FA6B8' },
  warn: { bg: '#F8EFDA', fg: '#A87C2C', dot: '#A87C2C' },
  danger: { bg: '#F7E5E5', fg: '#C25C5E', dot: '#C25C5E' },
};
function StatTile({ icon: Icon, count, label, tone, onPress }: { icon: any; count: number; label: string; tone: Tone; onPress: () => void }) {
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
      <Text variant="caption" color="secondary" style={{ marginTop: 3, fontSize: 11}}>{label}</Text>
    </Pressable>
  );
}

/* ---- Quick-actions grid (their ActionGrid) ----
 * Admin-only actions not already covered by "Action required" above (Approve
 * Members / Loan Decisions / Penalties were dropped from here since they
 * duplicate those stat tiles — still reachable via the stat tiles, the More
 * page, and the nav's more-sheet). The Owner's personal/member-facing tiles
 * (Contributions, Loans, Fund, My Ledger, More) moved to the "Member" switch
 * tab instead of living here too — see [groupId]/index.tsx's RoleSwitch.
 * Member Balances / Group Ledger / Expenses are real, already-authorized-for-owner
 * endpoints/screens that previously had no entry point anywhere in the Owner's UI.
 */
const ACTIONS: { label: string; icon: any; key: string }[] = [
  { label: 'Configure Cycle', icon: SlidersHorizontal, key: 'cycles/configure' },
  { label: 'Manage Officers', icon: Users, key: 'members/officers' },
  { label: 'Year-End Finalize', icon: CalendarClock, key: 'distribution/year-end' },
  { label: 'Member Balances', icon: Wallet, key: 'reports/member-balances' },
  { label: 'Group Ledger', icon: ScrollText, key: 'reports/group-ledger' },
  { label: 'Expenses', icon: Receipt, key: 'expenses/record' },
];

function SectionTitle({ title }: { title: string }) {
  return <Text variant="h3" style={{ fontSize: 15 }}>{title}</Text>;
}

export function OwnerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (sub: string) =>
    router.push({ pathname: `/(app)/[groupId]/${sub}` as any, params: { groupId } });
  const pendingLoans = useLoans(groupId, { status: 'pending' });
  const pendingMembers = useQuery(() => listPendingMembers(groupId), [groupId]);

  const loanCount = pendingLoans.data?.length ?? 0;
  const memberCount = Array.isArray(pendingMembers.data) ? pendingMembers.data.length : 0;
  const penaltyCount = 0; // no penalties API yet (M5.4)

  return (
    <>
      <FundHero groupId={groupId} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile icon={UserCheck} count={memberCount} label="Membership requests" tone="accent" onPress={() => go('members/approvals')} />
        <StatTile icon={Coins} count={loanCount} label="Loan decisions" tone="warn" onPress={() => go('loans/decisions')} />
        <StatTile icon={AlertTriangle} count={penaltyCount} label="Penalties to review" tone="danger" onPress={() => go('penalties')} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ACTIONS.map((a) => (
          <Pressable key={a.key} onPress={() => go(a.key)} style={{ width: '30.5%', alignItems: 'center', gap: 8 }}>
            <View style={[{ width: 62, height: 62, borderRadius: 16, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }, shadowToken.card]}>
              <a.icon size={25} color={semantic.brandDark} strokeWidth={1.8} />
            </View>
            <Text variant="caption" style={{ textAlign: 'center' }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Recent activity" />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
        <Text variant="body" color="muted">No recent activity yet.</Text>
      </View>
    </>
  );
}
