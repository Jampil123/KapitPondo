import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { FilterChips } from '@/components/shared/FilterChips';
import { semantic, shadowToken } from '@/theme/colors';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import { AuditTimeline } from '@/features/auditlog/AuditTimeline';
import type { AuditLogEntry } from '@/api/auditLog';

/** The Owner's view of the audit log: plain decisions, grouped by day — the Auditor keeps the detailed audit/log page. */
type Filter = 'all' | 'members' | 'loans' | 'money' | 'settings';

const FILTER_TYPES: Record<Exclude<Filter, 'all'>, string[]> = {
  members: ['membership_approval', 'membership_role', 'membership_heads'],
  loans: ['loan_decision', 'loan_disbursement', 'loan_payment'],
  money: ['contribution', 'expense', 'ledger_adjustment', 'penalty', 'reversal_request', 'distribution'],
  settings: ['cycle', 'group_gcash'],
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'members', label: 'Members' },
  { key: 'loans', label: 'Loans' },
  { key: 'money', label: 'Money' },
  { key: 'settings', label: 'Settings' },
];

function dayLabel(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
export default function OwnerActivity() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [older, setOlder] = useState<AuditLogEntry[]>([]);

  const page = useAuditLog(groupId!, { before: cursor, limit: 30 });
  // Pages accumulate as "Load older" is tapped.
  const all = useMemo(() => (cursor ? [...older, ...(page.data ?? [])] : page.data ?? []), [page.data, cursor, older]);
  const hasMore = (page.data?.length ?? 0) === 30;

  const days = useMemo(() => {
    const shown = filter === 'all' ? all : all.filter((e) => FILTER_TYPES[filter].includes(e.entity_type));
    const map = new Map<string, AuditLogEntry[]>();
    for (const e of shown) {
      const key = new Date(e.created_at).toDateString();
      const list = map.get(key);
      if (list) list.push(e); else map.set(key, [e]);
    }
    return Array.from(map.values());
  }, [all, filter]);

  function loadOlder() {
    const oldest = all[all.length - 1];
    if (!oldest) return;
    setOlder(all);
    setCursor(oldest.created_at);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Activity" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <FilterChips<Filter> options={FILTERS} value={filter} onChange={setFilter} />

        {page.loading && all.length === 0 ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : days.length === 0 ? (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', paddingVertical: 40 }}>No activity yet.</Text>
        ) : (
          days.map((list) => (
            <View key={list[0].id}>
              <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>{dayLabel(list[0].created_at)}</Text>
              <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16 }, shadowToken.soft]}>
                <AuditTimeline
                  entries={list}
                  showReason
                  onOpen={(e) => router.push({ pathname: '/(app)/[groupId]/owner-activity/[id]' as any, params: { groupId, id: e.id, at: e.created_at } })}
                />
              </View>
            </View>
          ))
        )}

        {hasMore ? (
          <Pressable onPress={loadOlder} disabled={page.loading} style={{ marginTop: 16, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: semantic.border, alignItems: 'center' }}>
            {page.loading ? <ActivityIndicator color={semantic.brandDark} /> : (
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>Load older</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
