import { useMemo } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useQuery } from '@/hooks/useApi';
import { listMembers, type GroupMember } from '@/api/groups';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { computePeriodSummary } from '@/features/contributions/periodSummary';
import { CollectionSummaryCard } from '@/features/contributions/CollectionSummaryCard';
import type { PeriodKind } from '@/features/contributions/periods';

const STATUS: Record<PeriodKind, { label: string; tone: { soft: string; text: string } }> = {
  paid: { label: 'Posted', tone: intent.success },
  review: { label: 'Awaiting review', tone: intent.warning },
  rejected: { label: 'Returned', tone: intent.warning },
  late: { label: 'Not paid', tone: intent.danger },
  due: { label: 'Not paid', tone: intent.danger },
  upcoming: { label: 'Not paid', tone: intent.danger },
};
// Unpaid first — that's what the treasurer is looking for in a past period.
const ORDER: Record<PeriodKind, number> = { late: 0, due: 0, upcoming: 0, rejected: 1, review: 2, paid: 3 };

/** One earlier period of the active cycle, read-only. Opened from the month switcher on the Contributions page. */
export default function ContributionPeriod() {
  const { groupId, idx: idxParam } = useLocalSearchParams<{ groupId: string; idx: string }>();
  const idx = Number(idxParam);

  const { cycle } = useActiveCycle(groupId!);
  const all = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const membersQ = useQuery(() => listMembers(groupId!), [groupId]);
  const roster: GroupMember[] = membersQ.data ?? [];
  const firstLoad = !cycle || (membersQ.data == null && !membersQ.error) || (all.data == null && !all.error);
  const periodWord = cycle?.frequency === 'weekly' ? 'week' : cycle?.frequency === 'quarterly' ? 'quarter' : 'month';

  const summary = useMemo(
    () => (cycle && roster.length && !isNaN(idx) ? computePeriodSummary(cycle, roster, all.data ?? [], idx) : null),
    [cycle, roster, all.data, idx],
  );
  const list = useMemo(() => {
    if (!summary) return [];
    return roster
      .map((m) => ({ m, entry: summary.perMember.get(m.id) ?? null }))
      .filter(({ entry }) => entry)
      .sort((a, b) => ORDER[a.entry!.kind] - ORDER[b.entry!.kind]);
  }, [roster, summary]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title={summary?.label || 'Contributions'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: intent.info.soft, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12 }}>
          <Info size={15} color={intent.info.text} />
          <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Poppins_500Medium', color: intent.info.text }}>
            Go back to switch {periodWord}s from the Contributions page.
          </Text>
        </View>

        {firstLoad ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : !summary ? (
          <Text variant="body" color="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>Nothing to show for this {periodWord}.</Text>
        ) : (
          <>
            <CollectionSummaryCard summary={summary} periodWord={periodWord} isPast />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
              {list.map(({ m, entry }) => {
                const s = STATUS[entry!.kind];
                return (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: 1, borderColor: semantic.border }}>
                    <Avatar name={m.members?.full_name ?? 'Member'} uri={m.members?.avatar_url} size={38} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{m.members?.full_name ?? 'Member'}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Text variant="caption" color="secondary">{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                        <View style={{ backgroundColor: s.tone.soft, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
                          <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: s.tone.text }}>{s.label}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: entry!.kind === 'paid' ? semantic.dashCard : semantic.textMuted }}>{formatPeso(entry!.amount)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
