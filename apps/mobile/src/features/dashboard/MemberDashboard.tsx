import { useState, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowUpCircle, Coins, Users, BarChart3, ArrowRight,
  ArrowUpRight, ArrowDownRight, CheckCircle2, Clock3, AlertTriangle, HelpCircle,
  Wallet, Layers, ChevronDown,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { DashboardBand, BAND_TAB_HEIGHT, glassPanel, onBandText } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken, type IntentName } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { parseApiDate } from '@/lib/cycle';
import { useActiveGroup } from '@/context/GroupContext';
import { useMyBalance, useLedger, useFundSummary } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { cyclePeriods, buildTimeline } from '@/features/contributions/periods';
import type { Contribution } from '@/api/contributions';

const CARD_BG = '#F5F9FA';
const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.045, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  boxShadow: '0px 4px 14px rgba(42,62,75,0.045)',
} as const;

function SectionHead({ title, aside, onAsidePress }: { title: string; aside?: string; onAsidePress?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside && onAsidePress ? (
        <Pressable onPress={onAsidePress} hitSlop={8}>
          <Text variant="caption" style={{ fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>{aside}</Text>
        </Pressable>
      ) : aside ? (
        <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text>
      ) : null}
    </View>
  );
}

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = parseApiDate(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: 'Week', biweekly: 'Period', quarterly: 'Quarter', monthly: 'Month',
};

/** "Month 4 of 12" for the section header — undefined when the cycle has no end_date to count against. */
function cycleProgressLabel(cycle: { start_date: string; end_date: string | null; frequency: string } | null): string | undefined {
  if (!cycle) return undefined;
  const periods = cyclePeriods(cycle);
  if (!periods.length) return undefined;
  const now = new Date();
  const elapsed = periods.filter((p) => p <= now).length;
  const current = Math.min(Math.max(elapsed, 1), periods.length);
  const word = FREQUENCY_LABEL[cycle.frequency] ?? 'Period';
  return `${word} ${current} of ${periods.length}`;
}

const STANDING_ICON: Record<IntentName, any> = {
  success: CheckCircle2, info: Clock3, danger: AlertTriangle, warning: Clock3,
  primary: HelpCircle, accent: HelpCircle, neutral: HelpCircle,
};

/** Standing card: status banner, amount, meta line, and the one action available for that status. */
function StandingCard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { membership } = useActiveGroup();
  const { cycle, loading: cycleLoading } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const rows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);
  const heads = membership?.heads ?? 1;
  const timeline = cycle ? buildTimeline(cycle, rows, heads) : [];
  const entry = timeline.find((p) => p.kind !== 'paid') ?? timeline[timeline.length - 1] ?? null;
  const current = entry?.row ?? null;
  const kind = entry?.kind ?? null;

  const loading = cycleLoading || contribs.loading;
  const meta: { intent: IntentName; label: string } = !cycle
    ? { intent: 'neutral', label: 'No active cycle' }
    : !entry
    ? { intent: 'neutral', label: 'No period yet' }
    : kind === 'rejected'
    ? { intent: 'danger', label: 'Rejected' }
    : kind === 'late'
    ? { intent: 'danger', label: 'Overdue' }
    : kind === 'review'
    ? { intent: 'info', label: 'Under review' }
    : { intent: 'success', label: 'Up to date' };
  const tone = intent[meta.intent];
  const Icon = STANDING_ICON[meta.intent];

  const amount = entry?.amount ?? (cycle ? Number(cycle.contribution_amount) * heads : null);
  const now = new Date();
  const due = entry?.dueDate ?? null;
  function go() {
    if (!entry || kind === 'paid') {
      router.push({ pathname: '/(app)/[groupId]/contributions' as any, params: { groupId } });
    } else if (entry.row) {
      router.push({ pathname: '/(app)/[groupId]/contributions/contribute' as any, params: { groupId, id: entry.row.id } });
    } else {
      router.push({ pathname: '/(app)/[groupId]/contributions/contribute' as any, params: { groupId, due: entry.dueDate.toISOString() } });
    }
  }

  let label = 'Next payment';
  let btnLabel = 'Submit payment';
  let ghost = false;
  let meta1: ReactNode = null;

  if (!cycle) {
    meta1 = <Text variant="body" style={{ fontSize: 12, lineHeight: 16, color: onBandText }}>This group has no active contribution cycle right now.</Text>;
  } else if (!entry) {
    meta1 = <Text variant="body" style={{ fontSize: 12, lineHeight: 16, color: onBandText }}>No contribution period has been recorded yet.</Text>;
  } else if (kind === 'paid') {
    btnLabel = 'View my contributions';
    ghost = true;
    meta1 = (
      <Text variant="body" style={{ fontSize: 12, lineHeight: 16, color: onBandText }}>
        Posted{current?.paid_date ? <> <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(current.paid_date)}</Text></> : null}
      </Text>
    );
  } else if (kind === 'review') {
    label = 'Submitted';
    btnLabel = 'View my proof';
    ghost = true;
    meta1 = <Text variant="body" style={{ fontSize: 12, lineHeight: 16, color: onBandText }}>Awaiting officer approval{due ? <> · originally due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due.toISOString())}</Text></> : null}</Text>;
  } else if (kind === 'rejected') {
    label = 'Amount due';
    btnLabel = 'Upload new proof';
    meta1 = <Text variant="body" style={{ fontSize: 12, lineHeight: 16, color: onBandText }}>Was due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due?.toISOString() ?? null)}</Text> · proof rejected</Text>;
  } else if (due) {
    const diff = daysBetween(due, now);
    if (kind === 'late') {
      const lateDays = Math.abs(diff);
      label = 'Amount due';
      btnLabel = 'Submit payment now';
      meta1 = (
        <Text variant="body" style={{ fontSize: 12, lineHeight: 16, color: onBandText }}>
          Was due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due.toISOString())}</Text>
          {'  '}<Text style={{ fontSize: 12, lineHeight: 16, color: intent.danger.text }}>· {lateDays} day{lateDays === 1 ? '' : 's'} late{cycle.penalty_amount ? ' — a penalty may apply after review' : ''}</Text>
        </Text>
      );
    } else {
      meta1 = (
        <Text variant="body" style={{ fontSize: 12, lineHeight: 16, color: onBandText }}>
          Due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due.toISOString())}</Text>
          {diff > 0 ? ` · ${diff} day${diff === 1 ? '' : 's'} from now` : diff === 0 ? ' · today' : ''}
        </Text>
      );
    }
  }

  return (
    <View style={{ paddingTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9, gap: 10 }}>
        <Text variant="overline" style={{ paddingTop: 4, color: onBandText }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tone.soft, paddingVertical: 3.5, paddingHorizontal: 8, borderRadius: 20 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tone.strong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={8} color="#fff" strokeWidth={2.5} />
          </View>
          <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: tone.text }}>{meta.label}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
      ) : (
        <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>
          {amount !== null ? formatPeso(amount) : '—'}
        </Text>
      )}

      <View style={{ marginTop: 8 }}>{meta1}</View>

      {current?.status === 'rejected' ? (
        <View style={{ marginTop: 12, backgroundColor: intent.danger.soft, borderRadius: 12, padding: 13 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: intent.danger.text, marginBottom: 3 }}>
            Proof rejected{current.paid_date ? ` · ${shortDate(current.paid_date)}` : ''}
          </Text>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: semantic.textSecondary }}>
            {current.rejection_reason ?? 'Ask an officer for the reason, then upload a clearer proof.'}
          </Text>
        </View>
      ) : null}

      {cycle ? (
        <Pressable
          onPress={go}
          style={[
            {
              marginTop: 15, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
              backgroundColor: ghost ? 'rgba(255,255,255,0.7)' : semantic.brandDark,
            },
          ]}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: ghost ? semantic.brandDark : '#fff' }}>{btnLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const UPCOMING_DOT = 'rgba(255,255,255,0.7)';

const DOT_TONE: Record<string, string> = {
  paid: intent.success.base,
  review: intent.info.base,
  late: intent.danger.base,
  due: semantic.brand,
  upcoming: UPCOMING_DOT,
};

/** Per-period dots for the active cycle — no bar with an invisible denominator. */
function CycleDots({ groupId }: { groupId: string }) {
  const { membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const rows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);

  if (!cycle) return null;

  const timeline = buildTimeline(cycle, rows, membership?.heads ?? 1);
  const slots = timeline.length;
  const kinds = timeline.map((p) => (p.kind === 'rejected' ? 'late' : p.kind));

  const progress = cycleProgressLabel(cycle);

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text variant="overline" color="secondary">This cycle</Text>
        {progress ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{progress}</Text> : null}
      </View>

      {slots ? (
        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4, marginBottom: 9 }}>
          {kinds.map((k, i) => (
            <View key={i} style={{ flex: 1, height: 9, minWidth: 0, borderRadius: 5, backgroundColor: DOT_TONE[k] }} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <LegendDot color={intent.success.base} label="Posted" />
        <LegendDot color={intent.info.base} label="Under review" />
        <LegendDot color={semantic.brand} label="Due" />
        <LegendDot color={UPCOMING_DOT} label="Upcoming" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 10 }} variant="caption" color="secondary">
        {label}
      </Text>
    </View>
  );
}

/** Half-circle tab hanging off the bottom centre of the band; toggles the capital + heads details. */
function PositionTab({ open, progress, onPress }: { open: boolean; progress: Animated.Value; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Hide capital and heads' : 'Show capital and heads'}
      style={[
        {
          width: BAND_TAB_HEIGHT * 2, height: BAND_TAB_HEIGHT,
          borderBottomLeftRadius: BAND_TAB_HEIGHT, borderBottomRightRadius: BAND_TAB_HEIGHT,
          backgroundColor: semantic.brandDark, alignItems: 'center', justifyContent: 'center', paddingBottom: 2,
        },
        shadowToken.card,
      ]}
    >
      <Animated.View style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
        <ChevronDown size={17} color="#fff" strokeWidth={2.2} />
      </Animated.View>
    </Pressable>
  );
}

const BAND_CHILD_GAP = 8; // DashboardBand spaces its children by this much
const POSITION_ANIM_MS = 260;

/** Animates its content's measured height and opacity with `progress` (0 closed, 1 open); stays mounted so it can animate. */
function Collapsible({ open, progress, children }: { open: boolean; progress: Animated.Value; children: ReactNode }) {
  const [height, setHeight] = useState(0);

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={{
        overflow: 'hidden',
        opacity: progress,
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
        marginTop: progress.interpolate({ inputRange: [0, 1], outputRange: [-BAND_CHILD_GAP, 0] }),
      }}
    >
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}

/** Capital + heads details revealed by PositionTab; both are already-fetched real values. */
function PositionPanel({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { membership } = useActiveGroup();
  const bal = useMyBalance(groupId);
  const { cycle } = useActiveCycle(groupId);
  const heads = membership?.heads ?? null;
  const capital = bal.loading ? '…' : formatPeso(bal.data?.contributions);

  function goToHeads() {
    router.push({ pathname: '/(app)/[groupId]/heads' as any, params: { groupId } });
  }

  return (
    <View style={glassPanel}>
      {cycle ? (
        <>
          <View style={{ padding: 12 }}>
            <CycleDots groupId={groupId} />
          </View>
          <View style={{ height: 1, backgroundColor: semantic.border }} />
        </>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
      <View style={{ flex: 1, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Wallet size={13} color={semantic.brandDark} />
          <Text variant="overline" color="secondary">My capital</Text>
        </View>
        <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 4, letterSpacing: -0.4 }}>{capital}</Text>
        <Text variant="caption" color="secondary" style={{ fontSize: 10.5, marginTop: 1 }}>contributions</Text>
      </View>
      <View style={{ width: 1, backgroundColor: semantic.border }} />
      <Pressable onPress={goToHeads} style={{ flex: 1, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Layers size={13} color={semantic.brandDark} />
          <Text variant="overline" color="secondary">My heads</Text>
          <View style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.brandDark }}>
            <ArrowRight size={11} color="#fff" strokeWidth={2.6} />
          </View>
        </View>
        <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 4, letterSpacing: -0.4 }}>{heads ?? '—'}</Text>
        <Text variant="caption" color="secondary" style={{ fontSize: 10.5, marginTop: 1 }} numberOfLines={1}>
          {cycle ? `${formatPeso(cycle.contribution_amount)} per head · ${cycle.frequency}` : 'No active cycle'}
        </Text>
      </Pressable>
      </View>
    </View>
  );
}

/** Group fund shown as composition (cash + on loan) so it never looks like money went missing. */
function FundComposition({ groupId }: { groupId: string }) {
  const fund = useFundSummary(groupId);

  if (fund.loading) {
    return (
      <View style={[{ backgroundColor: CARD_BG, borderRadius: 20, padding: 17, alignItems: 'center' }, CARD_SHADOW]}>
        <ActivityIndicator color={semantic.brand} />
      </View>
    );
  }

  const cash = Number(fund.data?.available_cash ?? 0);
  const onLoan = Math.max(0, Number(fund.data?.total_loan_disbursements ?? 0) - Number(fund.data?.total_loan_repayments ?? 0));
  const total = cash + onLoan;
  const cashPct = total > 0 ? (cash / total) * 100 : 100;
  const lentPct = 100 - cashPct;

  return (
    <View style={[{ backgroundColor: CARD_BG, borderRadius: 20, padding: 17 }, CARD_SHADOW]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 13 }}>
        <Text variant="label">Total Group Fund</Text>
        <Text style={{ fontSize: 19, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(total)}</Text>
      </View>

      <View style={{ flexDirection: 'row', height: 9, borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
        <View style={{ width: (cashPct + '%') as any, backgroundColor: semantic.brand }} />
        <View style={{ width: (lentPct + '%') as any, backgroundColor: '#E4A33C' }} />
      </View>

      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: semantic.brand }} />
          <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>Cash on hand</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(cash)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: '#E4A33C' }} />
          <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>Out on loan</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(onLoan)}</Text>
        </View>
      </View>
      
    </View>
    
  );
  
}


const ACTIONS: { label: string; icon: any; route: string }[] = [
  { label: 'Contributions', icon: ArrowUpCircle, route: 'contributions' },
  { label: 'Loans', icon: Coins, route: 'loans' },
  { label: 'Group & Officers', icon: Users, route: 'group' },
  { label: 'Reports', icon: BarChart3, route: 'reports' },
];

function RecentActivity({ groupId, onSeeAll }: { groupId: string; onSeeAll: () => void }) {
  const { membership } = useActiveGroup();
  const ledger = useLedger(groupId, { limit: 3, membership_id: membership?.id });
  const entries = ledger.data ?? [];

  return (
    <View style={[{ backgroundColor: CARD_BG, borderRadius: 20, padding: entries.length ? 6 : 20 }, CARD_SHADOW]}>
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
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 8, borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: credit ? intent.success.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={credit ? intent.success.text : semantic.brandDark} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" style={{ fontSize: 12.5 }} numberOfLines={1}>{e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="caption" color="secondary">{shortDate(e.posted_at)}</Text>
                    <View style={{ backgroundColor: intent.success.soft, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
                      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>Posted</Text>
                    </View>
                  </View>
                </View>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 14, color: credit ? intent.success.text : semantic.textPrimary }}>
                  {credit ? '+' : '-'}{formatPeso(e.amount)}
                </Text>
              </View>
            );
          })}
          <Pressable onPress={onSeeAll} style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderColor: semantic.border }}>
            <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '700' }}>See all activity</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function MemberHero({ groupId }: { groupId: string }) {
  const [positionOpen, setPositionOpen] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));

  function togglePosition() {
    const next = !positionOpen;
    setPositionOpen(next);
    Animated.timing(progress, {
      toValue: next ? 1 : 0,
      duration: POSITION_ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  return (
    <DashboardBand tab={<PositionTab open={positionOpen} progress={progress} onPress={togglePosition} />}>
      <StandingCard groupId={groupId} />
      <Collapsible open={positionOpen} progress={progress}>
        <PositionPanel groupId={groupId} />
      </Collapsible>
    </DashboardBand>
  );
}

export function MemberDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });

  return (
    <>
      {/* <SectionHead title="Group fund" /> */}
      <FundComposition groupId={groupId} />

      <SectionHead title="Shortcuts" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => go(a.route)}
            style={[{ width: '23%', borderRadius: 18, backgroundColor: CARD_BG, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, CARD_SHADOW]}
          >
            <a.icon size={26} color={semantic.brandDark} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 10, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHead title="My activity"/>
      <RecentActivity groupId={groupId} onSeeAll={() => go('activity')} />
    </>
  );
}
