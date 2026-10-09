import { useMemo, type ReactNode } from 'react';
import { View, Pressable } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useQuery } from '@/hooks/useApi';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { buildTimeline, currentPeriodIndex } from '@/features/contributions/periods';
import { listMembers } from '@/api/groups';

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// The denominator here used to be "members with a contribution row for this
// cycle" — but a member who hasn't paid a single period yet has NO row at
// all (nothing auto-creates one; see periods.ts), so they were silently
// dropped from both the count and the peso total instead of showing up as
// outstanding. Pulled from the full active roster (listMembers) instead.
// Each member's status comes from buildTimeline() at THE SAME calendar
// period index for everyone (currentPeriodIndex) — not each member's own
// first-unpaid period, which would make a member's payment disappear from
// "this month" the instant it's approved and their own progress rolls
// forward to next month.
/** "This month's collection" — shared by the Organizer and Treasurer dashboards. `head` renders the dashboard's own section heading. */
export function CollectionBlock({ groupId, go, head }: { groupId: string; go: (r: string) => void; head: (title: string, aside?: string) => ReactNode }) {
  const { cycle } = useActiveCycle(groupId);
  const contribs = useContributions(groupId, cycle?.id ? { cycle_id: cycle.id } : {});
  const membersQ = useQuery(() => listMembers(groupId), [groupId]);

  const rows = contribs.data ?? [];
  const roster = membersQ.data ?? [];

  const summary = useMemo(() => {
    if (!cycle || roster.length === 0) return null;
    const rowsByMember = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = rowsByMember.get(r.membership_id);
      if (list) list.push(r); else rowsByMember.set(r.membership_id, [r]);
    }

    // Expected is every active member's heads × this cycle's per-head rate — a plain
    // roster total, independent of anyone's individual payment history. (What each
    // member has actually paid can differ from that, which is exactly the gap this
    // widget exists to show — deriving "expected" from paid amounts would hide it.)
    const totalHeads = roster.reduce((s, m) => s + m.heads, 0);
    const expected = totalHeads * Number(cycle.contribution_amount);

    let collected = 0;
    let collectedCount = 0;
    let lateCount = 0;
    let latestDue: string | null = null;

    // The SAME calendar period for every member — not each member's own first
    // unpaid one. Otherwise a member who's already paid this month has their
    // "current" period roll forward to next month the instant it's approved,
    // and their payment disappears from THIS month's collected total.
    const periodIdx = currentPeriodIndex(cycle);

    for (const m of roster) {
      const timeline = buildTimeline(cycle, rowsByMember.get(m.id) ?? [], m.heads);
      const entry = periodIdx !== null ? (timeline[periodIdx] ?? null) : (timeline[timeline.length - 1] ?? null);
      if (!entry) continue; // open-ended cycle, this member has no rows yet — nothing to compare against
      if (entry.kind === 'paid') { collected += entry.amount; collectedCount++; }
      if (entry.kind === 'late') lateCount++;
      if (!latestDue) latestDue = entry.dueDate.toISOString(); // same period for everyone now, so the same due date
    }

    return { expected, collected, collectedCount, lateCount, latestDue, totalMembers: roster.length };
  }, [cycle, roster, rows]);

  if (!cycle || !summary) return null;

  const pct = summary.expected > 0 ? Math.min(100, Math.round((summary.collected / summary.expected) * 100)) : 0;

  return (
    <>
      {head("This month's collection", summary.latestDue ? `Due ${shortDate(summary.latestDue)}` : undefined)}
      <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 17 }, shadowToken.soft]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 }}>
          <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>
            {formatPeso(summary.collected)} <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>of {formatPeso(summary.expected)}</Text>
          </Text>
          <Text style={{ fontSize: 10.5, lineHeight: 13, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>{summary.collectedCount} of {summary.totalMembers} members</Text>
        </View>
        <View style={{ height: 9, borderRadius: 5, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: (pct + '%') as any, borderRadius: 5, backgroundColor: semantic.brand }} />
        </View>

        {summary.lateCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderColor: semantic.border }}>
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: intent.danger.soft, alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={15} color={intent.danger.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{summary.lateCount} member{summary.lateCount === 1 ? '' : 's'} overdue</Text>
              <Text variant="caption" color="secondary" style={{ fontSize: 10.5, lineHeight: 13, marginTop: 2 }}>Past the due date</Text>
            </View>
            <Pressable onPress={() => go('contributions/confirm')} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>View</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );
}
