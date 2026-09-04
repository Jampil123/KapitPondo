import { type ReactNode } from 'react';
import { Alert, View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowUpCircle, Coins, Users, BarChart3,
  ArrowUpRight, ArrowDownRight, CheckCircle2, Clock3, AlertTriangle, HelpCircle,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { parseApiDate } from '@/lib/cycle';
import { useActiveGroup } from '@/context/GroupContext';
import { useMyBalance, useLedger, useFundSummary } from '@/features/reporting/reporting.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { cyclePeriods, buildTimeline } from '@/features/contributions/periods';
import type { Contribution } from '@/api/contributions';

// Lighter than semantic.surfaceAlt so the secondary cards read as barely-tinted,
// but still distinct from the pure-white StandingCard hero at the top.
const CARD_BG = '#F5F9FA';

// Softer than the shared shadowToken.card — this dashboard's cards sit close
// together (CARD_BG is already barely-tinted), so the default shadow read as
// too high-contrast here. Same shape, lower opacity/spread/elevation.
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

/** The row this member should see front-and-center: the earliest not-yet-approved period, else the latest. */
export function pickCurrent(rows: Contribution[]): Contribution | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const ad = a.due_date ? parseApiDate(a.due_date).getTime() : new Date(a.created_at).getTime();
    const bd = b.due_date ? parseApiDate(b.due_date).getTime() : new Date(b.created_at).getTime();
    return ad - bd;
  });
  return sorted.find((r) => r.status !== 'approved') ?? sorted[sorted.length - 1];
}

/** Standing card: status banner, amount, meta line, and the one action available for that status. */
function StandingCard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { membership } = useActiveGroup();
  const { cycle, loading: cycleLoading } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const rows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);
  const heads = membership?.heads ?? 1;

  // Built from the full period timeline, not just existing rows — a member who has
  // paid every period so far has no row at all for the NEXT one (nothing auto-creates
  // it; see periods.ts), so picking straight from `rows` would leave the card stuck on
  // "Up to date" forever instead of flipping to "Submit payment"/"Overdue" as that next
  // period's due date approaches and passes.
  const timeline = cycle ? buildTimeline(cycle, rows, heads) : [];
  const entry = timeline.find((p) => p.kind !== 'paid') ?? timeline[timeline.length - 1] ?? null;
  const current = entry?.row ?? null;
  const kind = entry?.kind ?? null;

  const loading = cycleLoading || contribs.loading;
  // Standing is red whenever the period is late or rejected — kind otherwise collapses
  // to the 3 states a member cares about: up to date, under review, or rejected.
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

  // "View my contributions" (paid) goes to the history list; every other state goes to
  // the state-aware payment screen (submit / review / overdue / rejected) — pointed at
  // this exact period via `id` when there's a real row, or `due` when there isn't yet.
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
    meta1 = <Text variant="body" color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>This group has no active contribution cycle right now.</Text>;
  } else if (!entry) {
    meta1 = <Text variant="body" color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>No contribution period has been recorded yet.</Text>;
  } else if (kind === 'paid') {
    btnLabel = 'View my contributions';
    ghost = true;
    meta1 = (
      <Text variant="body" color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>
        Posted{current?.paid_date ? <> <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(current.paid_date)}</Text></> : null}
      </Text>
    );
  } else if (kind === 'review') {
    label = 'Submitted';
    btnLabel = 'View my proof';
    ghost = true;
    meta1 = <Text variant="body" color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>Awaiting officer approval{due ? <> · originally due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due.toISOString())}</Text></> : null}</Text>;
  } else if (kind === 'rejected') {
    label = 'Amount due';
    btnLabel = 'Upload new proof';
    meta1 = <Text variant="body" color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>Was due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due?.toISOString() ?? null)}</Text> · proof rejected</Text>;
  } else if (due) {
    const diff = daysBetween(due, now);
    if (kind === 'late') {
      const lateDays = Math.abs(diff);
      label = 'Amount due';
      btnLabel = 'Submit payment now';
      meta1 = (
        <Text variant="body" color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>
          Was due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due.toISOString())}</Text>
          {'  '}<Text style={{ fontSize: 12, lineHeight: 16, color: intent.danger.text }}>· {lateDays} day{lateDays === 1 ? '' : 's'} late{cycle.penalty_amount ? ' — a penalty may apply after review' : ''}</Text>
        </Text>
      );
    } else {
      meta1 = (
        <Text variant="body" color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>
          Due <Text style={{ fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{shortDate(due.toISOString())}</Text>
          {diff > 0 ? ` · ${diff} day${diff === 1 ? '' : 's'} from now` : diff === 0 ? ' · today' : ''}
        </Text>
      );
    }
  }

  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9, gap: 10 }}>
        <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>{label}</Text>
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
              backgroundColor: ghost ? semantic.surfaceAlt : semantic.brandDark,
            },
          ]}
        >
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: ghost ? semantic.brandDark : '#fff' }}>{btnLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const DOT_TONE: Record<string, string> = {
  paid: intent.success.base,
  review: intent.info.base,
  late: intent.danger.base,
  due: semantic.brand,
  upcoming: semantic.surfaceAlt,
};

/** Per-period dots for the active cycle — no bar with an invisible denominator. */
function CycleDots({ groupId }: { groupId: string }) {
  const { membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId);
  const bal = useMyBalance(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const rows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);

  if (!cycle) return null;

  // A "rejected" period reads as the same red dot as "late" here — the dot strip
  // only distinguishes 5 colors; the contributions list is where rejected vs.
  // actually-overdue gets its own icon.
  const timeline = buildTimeline(cycle, rows, membership?.heads ?? 1);
  const slots = timeline.length;
  const kinds = timeline.map((p) => (p.kind === 'rejected' ? 'late' : p.kind));

  const counts = kinds.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
  const summary = [
    counts.paid ? `${counts.paid} posted` : null,
    counts.review ? `${counts.review} under review` : null,
    counts.due ? `${counts.due} due` : null,
    counts.late ? `${counts.late} late` : null,
  ].filter(Boolean).join(' · ') || 'No periods recorded yet';

  return (
    <View style={[{ backgroundColor: CARD_BG, borderRadius: 20, padding: 17 }, CARD_SHADOW]}>
      {slots ? (
        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4, marginBottom: 14 }}>
          {kinds.map((k, i) => (
            <View key={i} style={{ flex: 1, height: 9, minWidth: 0, borderRadius: 5, backgroundColor: DOT_TONE[k] }} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <LegendDot color={intent.success.base} label="Posted" />
        <LegendDot color={intent.info.base} label="Under review" />
        <LegendDot color={semantic.brand} label="Due" />
        <LegendDot color={semantic.surfaceAlt} label="Upcoming" />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderColor: semantic.border }}>
        <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{summary}</Text>
        <Text variant="caption" color="secondary">
          Contributed so far <Text style={{ fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, fontSize: 13 }}>{bal.loading ? '…' : formatPeso(bal.data?.contributions)}</Text>
        </Text>
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

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: CARD_BG, borderRadius: 16, padding: 15 }, CARD_SHADOW]}>
      <Text variant="overline" color="muted">{label}</Text>
      <Text style={{ fontSize: 21, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 5, letterSpacing: -0.4 }}>{value}</Text>
      <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

/** My capital (this cycle's contributions) + heads, both already-fetched real values. */
function MyPosition({ groupId }: { groupId: string }) {
  const { membership } = useActiveGroup();
  const bal = useMyBalance(groupId);
  const { cycle } = useActiveCycle(groupId);
  const heads = membership?.heads ?? null;

  return (
    <View style={{ flexDirection: 'row', gap: 11 }}>
      <Stat
        label="My capital"
        value={bal.loading ? '…' : formatPeso(bal.data?.contributions)}
        sub="This cycle's contributions"
      />
      <Stat
        label="My heads"
        value={heads ?? '—'}
        sub={cycle ? `${formatPeso(cycle.contribution_amount)} per head · ${cycle.frequency}` : 'No active cycle'}
      />
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
        <View style={{ width: (lentPct + '%') as any, backgroundColor: intent.warning.base }} />
      </View>

      <View style={{ gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: semantic.brand }} />
          <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>Cash on hand</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(cash)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: intent.warning.base }} />
          <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>Out on loan</Text>
          <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(onLoan)}</Text>
        </View>
      </View>
      
    </View>
    
  );
  
}


const ACTIONS: ({ label: string; icon: any } & ({ route: string } | { soon: true }))[] = [
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

export function MemberDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { cycle } = useActiveCycle(groupId);
  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });

  function onTilePress(a: (typeof ACTIONS)[number]) {
    if ('soon' in a) return void Alert.alert(a.label, 'Coming soon.');
    go(a.route);
  }

  return (
    <>
      <StandingCard groupId={groupId} />

      <SectionHead title="This cycle" aside={cycleProgressLabel(cycle)} />
      <CycleDots groupId={groupId} />

     
      <MyPosition groupId={groupId} />

      {/* <SectionHead title="Group fund" /> */}
      <FundComposition groupId={groupId} />
      <Text variant="caption" color="muted" style={{lineHeight: 16, textAlign: 'justify' }}>
        Money lent to members is still part of the fund. It returns with interest as loans are repaid.
      </Text>

      <SectionHead title="Shortcuts" aside="View all" onAsidePress={() => go('more')} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => onTilePress(a)}
            style={[{ width: '23%', borderRadius: 18, backgroundColor: CARD_BG, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, CARD_SHADOW]}
          >
            <a.icon size={26} color={semantic.brandDark} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 10, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionHead title="My activity" aside="From my side" />
      <RecentActivity groupId={groupId} onSeeAll={() => go('activity')} />
    </>
  );
}
