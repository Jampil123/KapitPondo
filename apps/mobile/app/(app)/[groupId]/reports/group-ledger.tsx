/**
 * app/(app)/[groupId]/reports/group-ledger.tsx — Group Ledger (officer).
 * The full group-wide transaction history — distinct from reports/ledger.tsx
 * ("My Ledger", Member-branded, self-scoped) and from audit/postings.tsx (only
 * pending items). groupLedger() only filters to a single membership when one
 * is passed; calling useLedger with no membership_id as an officer already
 * returns every entry in the group, no backend change needed.
 */
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { AppBar } from '@/components/shared/AppBar';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLedger } from '@/features/reporting/reporting.hooks';
import type { LedgerEntry } from '@/api/ledger';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function LedgerRow({ e }: { e: LedgerEntry }) {
  const credit = e.direction === 'credit';
  const Icon = credit ? ArrowDownRight : ArrowUpRight;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: credit ? '#E2F0E8' : '#F7E5E5', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={credit ? '#3E8E66' : '#C25C5E'} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
        <Text variant="caption" color="secondary">{shortDate(e.posted_at)}</Text>
      </View>
      <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13.5, color: credit ? '#3E8E66' : '#C25C5E' }}>
        {credit ? '+' : '-'}{formatPeso(e.amount)}
      </Text>
    </View>
  );
}

export default function GroupLedger() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { role } = useActiveGroup();
  const ledger = useLedger(groupId!, {});
  const entries = ledger.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Group Ledger" subtitle={ROLE_LABEL[role ?? 'owner'] ?? 'Organizer'} />
      <View style={{ padding: 16, gap: 14, flex: 1 }}>
        {ledger.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : entries.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
            <Text variant="body" color="muted">No transactions yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 6 }, shadowToken.card]}>
              {entries.map((e, i) => (
                <View key={e.id} style={{ borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                  <LedgerRow e={e} />
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
