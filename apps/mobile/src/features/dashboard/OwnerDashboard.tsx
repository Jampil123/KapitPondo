import { useMemo } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Users, SlidersHorizontal, CalendarClock,
  Wallet, ScrollText, Check, Clock3, Download,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ScrollTileRow, type TileAction } from '@/components/shared/ScrollTileRow';
import { semantic, intent, steel, shadowToken } from '@/theme/colors';
import { DashboardBand, FoldTarget, glassPanel, onBandText } from '@/components/shared/DashboardBand';
import { formatPeso } from '@/lib/money';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useDistributions } from '@/features/distribution/distribution.hooks';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import { AuditTimeline } from '@/features/auditlog/AuditTimeline';
import { CollectionBlock } from './CollectionBlock';
import { PendingNote } from './PendingNote';
import { PendingActionsCard, shortDate } from './OrganizerActions';

function SectionHead({ title, aside, hot, onAsidePress, top = 14 }: { title: string; aside?: string; hot?: boolean; onAsidePress?: () => void; top?: number }) {
  const asideText = aside ? (
    <Text variant="caption" style={{ fontFamily: 'Poppins_600SemiBold', color: hot ? intent.danger.text : onAsidePress ? semantic.brandDark : semantic.textSecondary }}>{aside}</Text>
  ) : null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: top }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {onAsidePress && asideText ? <Pressable onPress={onAsidePress} hitSlop={8}>{asideText}</Pressable> : asideText}
    </View>
  );
}

/* ---------------- Fund card: composition, not a lone figure ---------------- */
function FundCard({ groupId }: { groupId: string }) {
  const { data, loading } = useSummary(groupId);
  const { cycle } = useActiveCycle(groupId);

  const pendingRepaid = Number(data?.pending_loan_repayments ?? 0);
  const pending = Number(data?.pending_contributions ?? 0) + pendingRepaid;
  const cash = Number(data?.available_cash ?? 0) + pending;
  const onLoan = Number(data?.out_on_loan ?? 0);
  const total = cash + onLoan;
  const cashPct = total > 0 ? (cash / total) * 100 : 100;
  const lentPct = 100 - cashPct;

  return (
    <View style={{ paddingTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <Text variant="overline" style={{ color: onBandText }}>Fund value</Text>
        {cycle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: intent.success.soft, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 20 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cycle.status === 'active' ? intent.success.base : semantic.textMuted }} />
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: cycle.status === 'active' ? intent.success.text : semantic.textSecondary }}>{cycle.status === 'active' ? 'Active' : cycle.status === 'draft' ? 'Draft' : 'Closed'}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
      ) : (
        <>
          <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>{formatPeso(total)}</Text>
          {pending > 0 ? <PendingNote amount={pending} /> : null}
        </>
      )}

      <View style={[glassPanel, { padding: 12, marginTop: 12 }]}>
        <View style={{ flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 10, backgroundColor: semantic.surfaceAlt }}>
          <View style={{ width: (cashPct + '%') as any, backgroundColor: steel[400] }} />
          <View style={{ width: (lentPct + '%') as any, backgroundColor: intent.danger.base }} />
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: steel[400] }} />
            <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>Cash on hand</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{formatPeso(cash)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: intent.danger.base }} />
            <Text style={{ fontSize: 12, lineHeight: 15, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>Out on loan</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12.5, lineHeight: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{formatPeso(onLoan)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---------------- Cycle closing: contextual, never ambient ---------------- */
function FinalizeCard({ groupId, go }: { groupId: string; go: (r: string) => void }) {
  const { data } = useDistributions(groupId);

  const current = useMemo(() => {
    if (!data) return null;
    const inFlight = data.filter((d) => d.status !== 'finalized' && d.status !== 'draft');
    if (!inFlight.length) return null;
    return inFlight.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  }, [data]);

  if (!current) return null;

  const verified = current.status === 'verified';

  return (
    <>
      <SectionHead title="Cycle closing" />
      <View style={{ backgroundColor: semantic.dashCard, borderRadius: 20, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 11 }}>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(47,168,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarClock size={15} color="#8ACBFF" />
          </View>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Year-end distribution</Text>
        </View>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: '#A9C4CF' }}>
          Finalizing posts every payout and locks the cycle permanently. It cannot be reopened.
        </Text>

        <View style={{ marginVertical: 14, gap: 9 }}>
          <Gate done label={`Preview prepared · ${shortDate(current.created_at)}`} />
          <Gate done={verified} label="Verified by Auditor" />
          <Gate done={false} label="Your finalization" />
        </View>

        <Pressable
          disabled={!verified}
          onPress={() => go('distribution/year-end')}
          style={{
            width: '100%', paddingVertical: 14, borderRadius: 13, alignItems: 'center',
            backgroundColor: verified ? '#2FA8FF' : 'rgba(255,255,255,0.1)',
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: verified ? '#052A47' : '#7794A2' }}>
            {verified ? 'Review preview, then finalize' : 'Waiting on Auditor verification'}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 11, color: '#87A5B2', textAlign: 'center', marginTop: 9, fontWeight: '600' }}>
          You'll see the full breakdown before anything is locked.
        </Text>
      </View>
    </>
  );
}

function Gate({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{ width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? '#3DD68C' : 'rgba(255,255,255,0.16)' }}>
        {done ? <Check size={11} color="#0B3323" strokeWidth={3} /> : null}
      </View>
      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: done ? '#C4D9E2' : '#8FA9B5' }}>{label}</Text>
    </View>
  );
}

const MANAGE_ACTIONS: TileAction[] = [
  { label: 'Manage Officers', icon: Users, route: 'members/officers' },
  { label: 'Group Ledger', icon: ScrollText, route: 'reports/group-ledger' },
  { label: 'Members', icon: Wallet, route: 'reports/member-balances' },
  { label: 'Configure Cycle', icon: SlidersHorizontal, route: 'cycles/configure' },
  { label: 'Year-End Distribution', icon: CalendarClock, route: 'distribution/year-end' },
  { label: 'Audit Trail', icon: Clock3, route: 'audit/log' },
  { label: 'Reports & Export', icon: Download, route: 'reports/export' },
];

/* ---------------- Activity — what officers decided (audit log), not money movements ---------------- */
function RecentActivity({ groupId }: { groupId: string }) {
  const router = useRouter();
  const log = useAuditLog(groupId, { limit: 3 });
  const entries = log.data ?? [];

  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16, marginTop: 8 }, shadowToken.soft]}>
      {log.loading && entries.length === 0 ? (
        <ActivityIndicator color={semantic.brand} style={{ margin: 8 }} />
      ) : entries.length === 0 ? (
        <Text variant="body" color="muted">No activity yet.</Text>
      ) : (
        <AuditTimeline
          entries={entries}
          onOpen={(e) => router.push({ pathname: '/(app)/[groupId]/owner-activity/[id]' as any, params: { groupId, id: e.id, at: e.created_at } })}
        />
      )}
    </View>
  );
}

export function OwnerHero({ groupId }: { groupId: string }) {
  return (
    <DashboardBand>
      <FoldTarget>
        <FundCard groupId={groupId} />
      </FoldTarget>
    </DashboardBand>
  );
}

export function OwnerDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (sub: string) => router.push({ pathname: `/(app)/[groupId]/${sub}` as any, params: { groupId } });

  return (
    <>
      <FinalizeCard groupId={groupId} go={go} />

      <PendingActionsCard groupId={groupId} head={(title, aside, hot) => <SectionHead title={title} aside={aside} hot={hot} top={6} />} />

      <CollectionBlock groupId={groupId} go={go} head={(title, aside) => <SectionHead title={title} aside={aside} />} />

      <ScrollTileRow actions={MANAGE_ACTIONS} go={go} />

      <SectionHead title="Recent activity" aside="See all" onAsidePress={() => go('owner-activity')} />
      <RecentActivity groupId={groupId} />
    </>
  );
}
