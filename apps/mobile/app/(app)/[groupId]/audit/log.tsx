import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileDown, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { PillFilters } from '@/components/shared/PillFilters';
import { semantic, shadowToken } from '@/theme/colors';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import { AuditTimeline } from '@/features/auditlog/AuditTimeline';
import type { AuditKind, AuditLogEntry } from '@/api/auditLog';

type FilterKey = 'all' | AuditKind;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'recorded', label: 'Recorded' },
  { key: 'verifications', label: 'Verifications' },
  { key: 'flags', label: 'Flags and findings' },
  { key: 'reversals', label: 'Reversals' },
];

const PAGE = 30;

export default function AuditTrail() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const [kind, setKind] = useState<FilterKey>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [earlier, setEarlier] = useState<AuditLogEntry[]>([]);

  const page = useAuditLog(groupId!, { kind: kind === 'all' ? undefined : kind, before: cursor, limit: PAGE });

  // Pages accumulate as "Load older" is tapped; a new filter starts over.
  const entries = useMemo(() => (cursor ? [...earlier, ...(page.data ?? [])] : page.data ?? []), [page.data, cursor, earlier]);

  function changeFilter(next: FilterKey) {
    setKind(next);
    setCursor(undefined);
    setEarlier([]);
  }
  function loadOlder() {
    const oldest = entries[entries.length - 1];
    if (!oldest) return;
    setEarlier(entries);
    setCursor(oldest.created_at);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader
        title="Audit trail"
        right={
          <Pressable onPress={() => router.push({ pathname: '/(app)/[groupId]/audit/export' as any, params: { groupId } })} hitSlop={8} accessibilityLabel="Export audit report" style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }}>
            <FileDown size={16} color={semantic.brandDark} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
          <Lock size={12} color={semantic.textSecondary} />
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>Nobody can edit or delete the audit trail, including you.</Text>
        </View>

        <View style={{ marginTop: 12 }}>
          <PillFilters<FilterKey> options={FILTERS} value={kind} onChange={changeFilter} />
        </View>

        <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16, marginTop: 12 }, shadowToken.soft]}>
          {page.loading && entries.length === 0 ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 8 }} />
          ) : entries.length === 0 ? (
            <Text variant="body" color="muted" style={{ textAlign: 'center' }}>Nothing here yet.</Text>
          ) : (
            <AuditTimeline
              entries={entries}
              onOpen={(e) => router.push({ pathname: '/(app)/[groupId]/audit/[id]' as any, params: { groupId, id: e.id, at: e.created_at } })}
            />
          )}
        </View>

        {entries.length > 0 && (page.data?.length ?? 0) >= PAGE ? (
          <Pressable onPress={loadOlder} disabled={page.loading} style={{ marginTop: 12, alignItems: 'center', paddingVertical: 12 }}>
            {page.loading && cursor ? <ActivityIndicator color={semantic.brand} /> : <Text variant="label" style={{ color: semantic.brandDark }}>Load older entries</Text>}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
