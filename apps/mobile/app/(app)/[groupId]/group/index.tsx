/**
 * app/(app)/[groupId]/group/index.tsx — Group & Officers (member).
 * Who's accountable (owner/treasurer/auditor) + the group's rules and key
 * dates, using the new member-safe /groups/:id/officers endpoint (names +
 * roles only — no email/phone, which stays officer-only via /members).
 */
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Users, Calendar, Coins } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useQuery } from '@/hooks/useApi';
import { listOfficers } from '@/api/groups';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor' };

function shortDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }, shadowToken.card]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon size={17} color={semantic.brandDark} />
        <Text variant="h3" style={{ fontSize: 15 }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function GroupOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group } = useActiveGroup();
  const { cycle, loading: cycleLoading } = useActiveCycle(groupId!);
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Group & Officers" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: semantic.brand, borderRadius: 18, padding: 16, gap: 4 }]}>
          <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{group?.name ?? 'Group'}</Text>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>Fund code: {group?.fund_code ?? '—'}</Text>
          <Text variant="caption" style={{ color: '#fff', opacity: 0.85 }}>
            {officers.loading ? 'Loading members…' : `${officers.data?.member_count ?? 0} active members`}
          </Text>
        </View>

        <Section title="Officers" icon={Users}>
          {officers.loading ? (
            <ActivityIndicator color={semantic.brand} />
          ) : (officers.data?.officers.length ?? 0) === 0 ? (
            <Text variant="body" color="muted">No officers assigned yet.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {officers.data!.officers.map((o, i) => (
                <View key={`${o.role}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={o.full_name ?? 'Officer'} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label" style={{ fontSize: 14 }}>{o.full_name ?? 'Unnamed'}</Text>
                    <Text variant="caption" color="secondary">{ROLE_LABEL[o.role] ?? o.role}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title="Group rules" icon={Coins}>
          {cycleLoading ? (
            <ActivityIndicator color={semantic.brand} />
          ) : cycle ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="body" color="secondary">Contribution</Text>
                <Text variant="label">{formatPeso(cycle.contribution_amount)} / {cycle.frequency}</Text>
              </View>
              {cycle.penalty_amount ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="body" color="secondary">Late penalty</Text>
                  <Text variant="label">
                    {cycle.penalty_type === 'percent' ? `${cycle.penalty_amount}%` : formatPeso(cycle.penalty_amount)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text variant="body" color="muted">No active cycle right now.</Text>
          )}
        </Section>

        <Section title="Key dates" icon={Calendar}>
          {cycle ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="body" color="secondary">Cycle</Text>
                <Text variant="label">{cycle.name}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="body" color="secondary">Started</Text>
                <Text variant="label">{shortDate(cycle.start_date) ?? '—'}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="body" color="secondary">Ends</Text>
                <Text variant="label">{shortDate(cycle.end_date) ?? 'Ongoing'}</Text>
              </View>
            </View>
          ) : (
            <Text variant="body" color="muted">No active cycle right now.</Text>
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}
