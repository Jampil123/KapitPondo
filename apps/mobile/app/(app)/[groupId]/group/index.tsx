/**
 * app/(app)/[groupId]/group/index.tsx — Group & Officers (member).
 * Two tabs: "Officers" (who's accountable + the group's rules/key dates) and
 * "Members" (a searchable names-only directory — /members/directory, separate
 * from the officer-only /members route which also exposes email/verification
 * status). Fund code isn't shown here — that's organizer-only info.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Users, Calendar, Coins, Search, UsersRound } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useQuery } from '@/hooks/useApi';
import { listOfficers, listMemberDirectory } from '@/api/groups';

type Tab = 'officers' | 'members';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

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
  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const [tab, setTab] = useState<Tab>('officers');
  const [query, setQuery] = useState('');

  const filteredMembers = useMemo(() => {
    const rows = directory.data ?? [];
    const q = query.trim().toLowerCase();
    return q ? rows.filter((m) => (m.full_name ?? '').toLowerCase().includes(q)) : rows;
  }, [directory.data, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Group & Officers" subtitle="Member" />
      <View style={{ padding: 16, gap: 14, flex: 1 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{group?.name ?? 'Group'}</Text>
          <Text variant="caption" color="secondary">
            {officers.loading ? 'Loading members…' : `${officers.data?.member_count ?? 0} active members`}
          </Text>
        </View>

        <Segmented<Tab>
          options={[
            { key: 'officers', label: 'Officers' },
            { key: 'members', label: 'Members', count: directory.data?.length ?? 0 },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'officers' ? (
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
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
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: semantic.surfaceAlt, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10 }}>
              <Search size={17} color={semantic.textMuted} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search members" placeholderTextColor={semantic.textMuted} style={{ flex: 1, fontSize: 13, color: semantic.textPrimary, padding: 0 }} />
            </View>

            {directory.loading ? (
              <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
            ) : filteredMembers.length === 0 ? (
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
                <Text variant="body" color="muted">{query ? 'No members match your search.' : 'No members yet.'}</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 6 }, shadowToken.card]}>
                  {filteredMembers.map((m, i) => (
                    <View
                      key={`${m.full_name}-${i}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: i < filteredMembers.length - 1 ? 1 : 0, borderColor: semantic.border }}
                    >
                      <Avatar name={m.full_name ?? 'Member'} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }}>{m.full_name ?? 'Unnamed'}</Text>
                        <Text variant="caption" color="secondary">{ROLE_LABEL[m.role] ?? m.role}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
