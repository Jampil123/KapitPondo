import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpDown, FileDown } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { FilterChips } from '@/components/shared/FilterChips';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { shareCsv } from '@/lib/csv';
import { useAuth } from '@/context/AuthContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useLoans } from '@/features/lending/lending.hooks';
import { usePenalties } from '@/features/penalties/penalties.hooks';
import { useQuery, useAction } from '@/hooks/useApi';
import { listMembers, nudgeMember, type GroupMember } from '@/api/groups';
import { buildTimeline, type PeriodKind } from '@/features/contributions/periods';

type Filter = 'all' | 'arrears' | 'loans' | 'clear';
type Sort = 'owed' | 'name';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor' };
const DOT_TONE: Record<PeriodKind, string> = {
  paid: intent.success.base, review: intent.info.base, rejected: intent.danger.base,
  late: intent.danger.base, due: semantic.surfaceAlt, upcoming: semantic.surfaceAlt,
};

interface Row {
  m: GroupMember;
  kinds: PeriodKind[];
  capital: number;
  reviewCount: number;
  behindCount: number;
  owed: number;
  loanBalance: number;
  penaltyTotal: number;
}

function name(m: GroupMember) { return m.members?.full_name ?? 'Unnamed'; }

export default function MemberBalances() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { member } = useAuth();
  const { cycle } = useActiveCycle(groupId!);

  const roster = useQuery(() => listMembers(groupId!), [groupId]);
  const contribs = useContributions(groupId!, cycle?.id ? { cycle_id: cycle.id } : {});
  const loans = useLoans(groupId!, { status: 'active' });
  const penalties = usePenalties(groupId!, 'pending');
  const nudge = useAction((memberId: string) => nudgeMember(groupId!, memberId));

  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('owed');
  const [exporting, setExporting] = useState(false);

  const loading = roster.loading || contribs.loading || loans.loading || penalties.loading;

  const rows = useMemo<Row[]>(() => {
    if (!cycle) return [];
    const people = roster.data ?? [];

    const rowsByMembership = new Map<string, typeof contribs.data>();
    for (const c of contribs.data ?? []) {
      const list = rowsByMembership.get(c.membership_id) ?? [];
      list.push(c);
      rowsByMembership.set(c.membership_id, list);
    }

    return people.map((m) => {
      const timeline = buildTimeline(cycle, rowsByMembership.get(m.id) ?? [], m.heads);
      const kinds = timeline.map((p) => p.kind);
      const capital = timeline.filter((p) => p.kind === 'paid').reduce((s, p) => s + p.amount, 0);
      const reviewCount = timeline.filter((p) => p.kind === 'review').length;
      const behind = timeline.filter((p) => p.kind === 'late' || p.kind === 'rejected');
      const loan = (loans.data ?? []).find((l) => l.membership_id === m.id) ?? null;
      const penaltyTotal = (penalties.data ?? []).filter((p) => p.membership_id === m.id).reduce((s, p) => s + Number(p.amount), 0);
      return {
        m, kinds, capital, reviewCount,
        behindCount: behind.length,
        owed: behind.reduce((s, p) => s + p.amount, 0),
        loanBalance: loan ? Number(loan.outstanding_balance) : 0,
        penaltyTotal,
      };
    });
  }, [cycle, roster.data, contribs.data, loans.data, penalties.data]);

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (filter === 'arrears') return r.behindCount > 0;
      if (filter === 'loans') return r.loanBalance > 0;
      if (filter === 'clear') return r.behindCount === 0;
      return true;
    });
    return [...list].sort((a, b) => sort === 'owed' ? b.owed - a.owed : name(a.m).localeCompare(name(b.m)));
  }, [rows, filter, sort]);

  const behindRows = rows.filter((r) => r.behindCount > 0);

  const arrearsTotal = rows.reduce((s, r) => s + r.owed, 0);
  const onLoanTotal = rows.reduce((s, r) => s + r.loanBalance, 0);
  const penaltiesTotal = rows.reduce((s, r) => s + r.penaltyTotal, 0);

  async function onNudge(r: Row) {
    const ok = await nudge.run(r.m.member_id);
    if (ok === undefined && nudge.error) Alert.alert('Could not send reminder', nudge.error.message);
  }

  function onNudgeAll() {
    if (behindRows.length === 0) return;
    Alert.alert('Nudge everyone behind?', `Sends a reminder to ${behindRows.length} member${behindRows.length === 1 ? '' : 's'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => behindRows.forEach((r) => nudge.run(r.m.member_id)) },
    ]);
  }

  async function onExport() {
    setExporting(true);
    try {
      const header = ['Name', 'Role', 'Heads', 'Verified', 'Capital posted', 'Months behind', 'Amount owed', 'Loan outstanding', 'Penalties'];
      const csvRows: (string | number)[][] = [header];
      for (const r of rows) {
        csvRows.push([
          name(r.m), ROLE_LABEL[r.m.role] ?? 'Member', r.m.heads,
          r.m.members?.verification_status === 'verified' ? 'Yes' : 'No',
          r.capital, r.behindCount, r.owed, r.loanBalance, r.penaltyTotal,
        ]);
      }
      await shareCsv('member-balances.csv', csvRows);
    } catch (e) {
      Alert.alert('Could not export', (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'arrears', label: 'Behind', count: behindRows.length || undefined },
    { key: 'loans', label: 'Loans' },
    { key: 'clear', label: 'Up to date' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader
        title="Member balances"
        right={
          <Pressable onPress={() => setSort((s) => (s === 'owed' ? 'name' : 'owed'))} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowUpDown size={16} color={semantic.brandDark} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: behindRows.length > 0 ? 100 : 40 }}>

        {/* ---------------- Summary ---------------- */}
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16 }}>
          <View style={{ flexDirection: 'row' }}>
            {[
              { k: 'Overdue', v: arrearsTotal, color: intent.danger.base },
              { k: 'Out on loan', v: onLoanTotal, color: intent.danger.base },
              { k: 'Penalties', v: penaltiesTotal, color: intent.warning.base },
            ].map((s, i) => (
              <View key={s.k} style={{ flex: 1, paddingLeft: i > 0 ? 13 : 0, borderLeftWidth: i > 0 ? 1 : 0, borderColor: 'rgba(42,62,75,0.1)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3, backgroundColor: s.color }} />
                  <Text variant="overline" color="muted">{s.k}</Text>
                </View>
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }}>{formatPeso(s.v)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ---------------- Filters ---------------- */}
        <FilterChips<Filter> options={FILTERS} value={filter} onChange={setFilter} style={{ marginTop: 14 }} />

        {/* ---------------- Rows ---------------- */}
        {loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : !cycle ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text variant="body" color="secondary">No active cycle right now.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text variant="body" color="secondary">No one matches this filter.</Text>
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            {filtered.map((r, i) => {
              const behind = r.behindCount > 0;
              const unverified = r.m.members?.verification_status !== 'verified';
              return (
                <View key={r.m.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 2, borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                  <View style={{ marginTop: 2 }}>
                    <Avatar name={name(r.m)} uri={r.m.members?.avatar_url} size={44} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>
                        {name(r.m)}{r.m.member_id === member?.id ? <Text style={{ color: semantic.brandDark }}> · you</Text> : null}
                      </Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: semantic.textMuted }}>{r.m.heads} head{r.m.heads === 1 ? '' : 's'}</Text>
                    </View>

                    {r.kinds.length > 0 ? (
                      <View style={{ flexDirection: 'row', gap: 3, marginTop: 8 }}>
                        {r.kinds.map((k, ki) => <View key={ki} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: DOT_TONE[k] }} />)}
                      </View>
                    ) : null}

                    {r.m.role !== 'member' || r.loanBalance > 0 || r.penaltyTotal > 0 || unverified ? (
                      <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                        {r.m.role !== 'member' ? (
                          <View style={{ backgroundColor: semantic.dashCard, paddingHorizontal: 8, paddingVertical: 1.5, borderRadius: 20 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{ROLE_LABEL[r.m.role]}</Text>
                          </View>
                        ) : null}
                        {r.loanBalance > 0 ? (
                          <View style={{ backgroundColor: intent.danger.soft, paddingHorizontal: 8, paddingVertical: 1.5, borderRadius: 20 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>{formatPeso(r.loanBalance)} loan</Text>
                          </View>
                        ) : null}
                        {r.penaltyTotal > 0 ? (
                          <View style={{ backgroundColor: intent.danger.soft, paddingHorizontal: 8, paddingVertical: 1.5, borderRadius: 20 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>{formatPeso(r.penaltyTotal)} penalty</Text>
                          </View>
                        ) : null}
                        {unverified ? (
                          <View style={{ backgroundColor: intent.warning.soft, paddingHorizontal: 8, paddingVertical: 1.5, borderRadius: 20 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: intent.warning.text }}>Unverified</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 9 }}>
                      {behind ? (
                        <>
                          <Text variant="caption" style={{ flex: 1, color: intent.danger.text, fontWeight: '600' }}>
                            {r.behindCount} month{r.behindCount === 1 ? '' : 's'} behind · <Text style={{ fontFamily: 'Poppins_700Bold', color: intent.danger.text }}>{formatPeso(r.owed)}</Text>
                          </Text>
                          <Pressable onPress={() => onNudge(r)} disabled={nudge.loading} style={{ backgroundColor: semantic.surfaceAlt, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 9 }}>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Nudge</Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                            Capital{r.reviewCount > 0 ? ` · ${r.reviewCount} under review` : ''}
                          </Text>
                          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(r.capital)}</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={onExport}
          disabled={exporting || rows.length === 0}
          style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: semantic.border, opacity: exporting || rows.length === 0 ? 0.5 : 1 }}
        >
          {exporting ? <ActivityIndicator color={semantic.brandDark} /> : <FileDown size={17} color={semantic.brandDark} />}
          <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Export list (CSV)</Text>
        </Pressable>
      </ScrollView>

      {behindRows.length > 0 ? (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: semantic.background, borderTopWidth: 1, borderColor: semantic.border }}>
          <Pressable onPress={onNudgeAll} disabled={nudge.loading} style={[{ backgroundColor: semantic.brandDark, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }, shadowToken.card]}>
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Nudge all behind · {behindRows.length}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
