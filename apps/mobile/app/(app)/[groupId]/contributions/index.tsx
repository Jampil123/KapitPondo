import { useMemo, useState } from 'react';
import { View, ScrollView, Image, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Clock3, AlertTriangle, RotateCcw, Clock, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { parseApiDate } from '@/lib/cycle';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { PayGcashSheet } from '@/features/contributions/PayGcashSheet';
import { useMyBalance } from '@/features/reporting/reporting.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { buildTimeline, cyclePeriods, periodLabel, type PeriodEntry, type PeriodKind } from '@/features/contributions/periods';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

const DOT_TONE: Record<PeriodKind, string> = {
  paid: intent.success.base,
  review: intent.info.base,
  rejected: intent.danger.base,
  late: intent.danger.base,
  due: semantic.brand,
  upcoming: semantic.surfaceAlt,
};

function shortDate(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : parseApiDate(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

type Filter = 'all' | 'action' | 'posted';

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 10.5 }} variant="caption" color="secondary">{label}</Text>
    </View>
  );
}

/** Underline tabs — this page's own filter bar, not the shared pill-style Segmented control. */
function TabBar<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: semantic.border }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={{ flex: 1, alignItems: 'center', paddingBottom: 11, gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, fontFamily: active ? 'Poppins_700Bold' : 'Poppins_600SemiBold', color: active ? semantic.brandDark : semantic.textSecondary }}>
                {o.label}
              </Text>
              {o.count ? (
                <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? semantic.brandDark : semantic.surfaceAlt }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{o.count}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ height: 3, width: '60%', borderRadius: 2, backgroundColor: active ? semantic.brandDark : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

function GroupLabel({ title }: { title: string }) {
  return <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2, letterSpacing: 0.8 }}>{title}</Text>;
}

const ICON: Record<PeriodKind, any> = { paid: Check, review: Clock3, rejected: RotateCcw, late: AlertTriangle, due: Clock, upcoming: Clock };
const ICON_TONE: Record<PeriodKind, IntentName> = { paid: 'success', review: 'info', rejected: 'danger', late: 'danger', due: 'primary', upcoming: 'neutral' };

function Thumb({ path }: { path: string | null }) {
  const url = useSignedProofUrl(path);
  if (!url) return null;
  return (
    <View style={{ width: 34, height: 34, borderRadius: 9, overflow: 'hidden', backgroundColor: semantic.surfaceAlt }}>
      <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

function ActionRow({ entry, frequency, onPress }: { entry: PeriodEntry; frequency: string; onPress: () => void }) {
  const Icon = ICON[entry.kind];
  const tone = intent[ICON_TONE[entry.kind]];
  const label = periodLabel(entry.periodStart, frequency);

  let sub: string;
  let tagLabel: string;
  if (entry.kind === 'rejected') {
    sub = `Proof returned ${shortDate(entry.row?.updated_at)}`;
    tagLabel = 'Resubmit';
  } else if (entry.kind === 'late') {
    const days = Math.abs(daysBetween(entry.dueDate, new Date()));
    sub = `Was due ${shortDate(entry.dueDate)}`;
    tagLabel = `${days} day${days === 1 ? '' : 's'} late`;
  } else {
    sub = `Sent ${shortDate(entry.row?.created_at)}`;
    tagLabel = 'Under review';
  }

  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={tone.text} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <Text variant="caption" color="secondary">{sub}</Text>
          <View style={{ backgroundColor: tone.soft, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: tone.text }}>{tagLabel}</Text>
          </View>
        </View>
      </View>
      {entry.row?.proof_url ? <Thumb path={entry.row.proof_url} /> : entry.kind === 'late' ? (
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(entry.amount)}</Text>
      ) : null}
      <ChevronRight size={16} color={semantic.textMuted} />
    </Pressable>
  );
}

function PostedRow({ entry }: { entry: PeriodEntry }) {
  const row = entry.row!;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={17} color={intent.success.text} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{row.approver?.full_name ? `Verified ${shortDate(row.paid_date)} by ${row.approver.full_name}` : `Posted ${shortDate(row.paid_date)}`}</Text>
        <View style={{ backgroundColor: intent.success.soft, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20, marginTop: 3 }}>
          <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>Posted</Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(row.amount)}</Text>
    </View>
  );
}

function UpcomingRow({ entry, frequency, onPress }: { entry: PeriodEntry; frequency: string; onPress?: () => void }) {
  const label = periodLabel(entry.periodStart, frequency);
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border, opacity: onPress ? 1 : 0.55 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: entry.kind === 'due' ? semantic.surfaceAlt : '#F2F7F9', alignItems: 'center', justifyContent: 'center' }}>
        <Clock size={16} color={entry.kind === 'due' ? semantic.brandDark : semantic.textMuted} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{label}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>Due {shortDate(entry.dueDate)}</Text>
      </View>
      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>{formatPeso(entry.amount)}</Text>
      {onPress ? <ChevronRight size={16} color={semantic.textMuted} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

function PenaltyNotice({ amount, type }: { amount: number | string; type: string | null }) {
  return (
    <View style={{ paddingVertical: 11, paddingHorizontal: 16, paddingLeft: 66, backgroundColor: intent.warning.soft, borderBottomWidth: 1, borderColor: semantic.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>Late penalty may apply</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2, fontSize: 10.5 }}>The Owner reviews this before it applies</Text>
      </View>
      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>
        {type === 'percent' ? `${amount}%` : formatPeso(amount)}
      </Text>
    </View>
  );
}

export default function ContributionsOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { membership, group } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const contribs = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const bal = useMyBalance(groupId!);
  const [filter, setFilter] = useState<Filter>('all');
  const [paySheetTarget, setPaySheetTarget] = useState<PeriodEntry | null>(null);

  const heads = membership?.heads ?? 1;
  const rows = (contribs.data ?? []).filter((c) => c.membership_id === membership?.id);

  const timeline = useMemo(
    () => (cycle ? buildTimeline(cycle, rows, heads) : []),
    [cycle, rows, heads],
  );
  const totalPeriods = cycle ? cyclePeriods(cycle).length : 0;

  const needsAction = timeline.filter((p) => p.kind === 'late' || p.kind === 'rejected');
  const inProgress = timeline.filter((p) => p.kind === 'review');
  const posted = timeline.filter((p) => p.kind === 'paid');
  const upcoming = timeline.filter((p) => p.kind === 'due' || p.kind === 'upcoming');

  function openEntry(entry: PeriodEntry) {
    if (entry.row) {
      router.push({ pathname: '/(app)/[groupId]/contributions/contribute' as any, params: { groupId, id: entry.row.id } });
    } else {
      router.push({ pathname: '/(app)/[groupId]/contributions/contribute' as any, params: { groupId, due: entry.dueDate.toISOString() } });
    }
  }

  // The sticky "Pay <period> — <amount>" shortcut jumps straight to the GCash
  // sheet instead of the full contribute screen — 'rejected' still needs the
  // full page (rejection reason, previous proof, etc.), and a group with no
  // treasurer GCash number configured has nothing to build that sheet's QR
  // against, so both fall back to the full page (which itself falls back to
  // the manual-only form in that second case).
  function onPressNextPayable(entry: PeriodEntry) {
    if (entry.kind === 'rejected' || !group?.treasurer_gcash_number) openEntry(entry);
    else setPaySheetTarget(entry);
  }

  const nextPayable = needsAction.find((p) => p.kind === 'rejected') ?? needsAction.find((p) => p.kind === 'late') ?? upcoming.find((p) => p.kind === 'due');

  const badge: { tone: IntentName; label: string } =
    needsAction.length > 0 ? { tone: 'danger', label: `${needsAction.length} need${needsAction.length === 1 ? 's' : ''} action` } :
    inProgress.length > 0 ? { tone: 'info', label: `${inProgress.length} under review` } :
    { tone: 'success', label: 'All caught up' };
  const badgeTone = intent[badge.tone];

  const showGroup = (sec: 'action' | 'progress' | 'posted' | 'upcoming') =>
    filter === 'all' || (filter === 'action' && (sec === 'action' || sec === 'progress')) || (filter === 'posted' && sec === 'posted');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="My contributions" subtitle={`${group?.name ?? 'Group'} · ${cycle?.name ?? 'No active cycle'}`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: nextPayable ? 110 : 40 }}>

        {/* ---------------- Summary (transparent, no card) ---------------- */}
        <View style={{ paddingHorizontal: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Contributed so far</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: badgeTone.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: badgeTone.text }}>{badge.label}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8, marginTop: 4 }}>
            {contribs.loading || bal.loading ? '…' : formatPeso(bal.data?.contributions)}
          </Text>
          <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
            {totalPeriods > 0 ? `${posted.length} of ${totalPeriods} periods posted` : `${posted.length} posted so far`}
            {cycle ? <> · <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{formatPeso(cycle.contribution_amount)}</Text> per period at {heads} head{heads === 1 ? '' : 's'}</> : null}
          </Text>

          {timeline.length ? (
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 16 }}>
              {timeline.map((p) => (
                <View key={p.index} style={{ flex: 1, height: 9, minWidth: 0, borderRadius: 5, backgroundColor: DOT_TONE[p.kind] }} />
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 12, paddingTop: 13, borderTopWidth: 1, borderColor: semantic.border }}>
            <LegendDot color={intent.success.base} label="Posted" />
            <LegendDot color={intent.info.base} label="Under review" />
            <LegendDot color={intent.danger.base} label="Overdue" />
            <LegendDot color={semantic.brand} label="Due" />
            <LegendDot color={semantic.surfaceAlt} label="Upcoming" />
          </View>
        </View>

        {/* ---------------- Filters ---------------- */}
        <View style={{ marginTop: 20 }}>
          <TabBar<Filter>
            options={[
              { key: 'all', label: 'All' },
              { key: 'action', label: 'Needs action', count: needsAction.length + inProgress.length || undefined },
              { key: 'posted', label: 'Posted', count: posted.length || undefined },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>

        {contribs.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : !cycle ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 16 }, CARD_SHADOW]}>
            <Text variant="body" color="muted">This group has no active contribution cycle right now.</Text>
          </View>
        ) : (
          <>
            {showGroup('action') && needsAction.length > 0 && (
              <>
                <GroupLabel title="Needs your action" />
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
                  {needsAction.map((entry) => (
                    <View key={entry.index}>
                      <ActionRow entry={entry} frequency={cycle.frequency} onPress={() => openEntry(entry)} />
                      {entry.kind === 'late' && cycle.penalty_amount ? <PenaltyNotice amount={cycle.penalty_amount} type={cycle.penalty_type} /> : null}
                    </View>
                  ))}
                </View>
              </>
            )}

            {showGroup('progress') && inProgress.length > 0 && (
              <>
                <GroupLabel title="In progress" />
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
                  {inProgress.map((entry) => <ActionRow key={entry.index} entry={entry} frequency={cycle.frequency} onPress={() => openEntry(entry)} />)}
                </View>
              </>
            )}

            {showGroup('posted') && posted.length > 0 && (
              <>
                <GroupLabel title="Posted to the ledger" />
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
                  {posted.map((entry) => <PostedRow key={entry.index} entry={entry} />)}
                </View>
              </>
            )}

            {showGroup('upcoming') && upcoming.length > 0 && (
              <>
                <GroupLabel title="Upcoming" />
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
                  {upcoming.map((entry) => (
                    <UpcomingRow key={entry.index} entry={entry} frequency={cycle.frequency} onPress={entry.kind === 'due' ? () => openEntry(entry) : undefined} />
                  ))}
                </View>
              </>
            )}

            {timeline.length === 0 ? (
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 16 }, CARD_SHADOW]}>
                <Text variant="body" color="muted">No contributions yet.</Text>
              </View>
            ) : null}

            <Text variant="caption" color="secondary" style={{ marginTop: 16, lineHeight: 17, paddingHorizontal: 2 }}>
              Every period you pay is returned to you as capital at the end of the cycle. Profit is shared separately, by heads.
            </Text>
          </>
        )}
      </ScrollView>

      {nextPayable ? (
        <LinearGradient
          colors={['transparent', semantic.background, semantic.background]}
          locations={[0, 0.4, 1]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingTop: 28 }}
        >
          <Pressable
            onPress={() => onPressNextPayable(nextPayable)}
            style={[{ paddingVertical: 15, borderRadius: 14, alignItems: 'center', backgroundColor: semantic.brandDark }, CARD_SHADOW]}
          >
            <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>
              {nextPayable.kind === 'rejected' ? 'Resubmit' : 'Pay'} {periodLabel(nextPayable.periodStart, cycle!.frequency, true)} — {formatPeso(nextPayable.amount)}
            </Text>
          </Pressable>
        </LinearGradient>
      ) : null}

      {cycle ? (
        <PayGcashSheet
          visible={!!paySheetTarget}
          onClose={() => setPaySheetTarget(null)}
          cycleId={cycle.id}
          amount={paySheetTarget?.amount ?? 0}
          dueDate={paySheetTarget?.dueDate ?? null}
          onSubmitted={() => { setPaySheetTarget(null); contribs.refetch(); }}
        />
      ) : null}
    </SafeAreaView>
  );
}
