/**
 * app/(app)/[groupId]/reports/member-balances.tsx — Member Balances (officer).
 * Per-member paid-in/net-balance table — distinct from FundHero's group-wide
 * aggregate and from the Member-only personal ledger. Wraps useMemberBalances,
 * which was already wired to the officer-only /reports/member-balances endpoint
 * but had no screen using it anywhere in the app until now.
 */
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar } from '@/components/shared/AppBar';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLocalSearchParams } from 'expo-router';
import { useMemberBalances } from '@/features/reporting/reporting.hooks';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

export default function MemberBalances() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { role } = useActiveGroup();
  const balances = useMemberBalances(groupId!);
  const rows = balances.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Member Balances" subtitle={ROLE_LABEL[role ?? 'owner'] ?? 'Organizer'} />
      <View style={{ padding: 16, gap: 14, flex: 1 }}>
        {balances.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
            <Text variant="body" color="muted">No members yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 6 }, shadowToken.card]}>
              {rows.map((m, i) => (
                <View
                  key={m.membership_id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: semantic.border }}
                >
                  <Avatar name={m.full_name ?? 'Member'} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label" style={{ fontSize: 14 }}>{m.full_name ?? 'Unnamed'}</Text>
                    <Text variant="caption" color="secondary">
                      {ROLE_LABEL[m.role] ?? m.role}{m.heads > 1 ? ` · ${m.heads} heads` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 14, color: semantic.textPrimary }}>{formatPeso(m.balance)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
