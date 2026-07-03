/**
 * app/(app)/[groupId]/members-officers.tsx
 * ----------------------------------------------------------------------------
 * Owner manages members + appoints officers (designer layout, wired to API):
 *   list → listMembers(groupId)     change role → setMemberRole(groupId, id, role)
 *
 * Role change uses an action sheet (Make Treasurer / Auditor / Member). The
 * owner's own row is locked. "Standing" from the prototype is omitted — our API
 * doesn't expose it yet.
 */
import { useMemo, useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { useQuery, useAction } from '@/hooks/useApi';
import { listMembers, setMemberRole } from '@/api/groups';
import type { GroupRole } from '@/constants/roles';

type Row = { id: string; name: string; role: GroupRole; heads: number };
function normalize(m: any): Row {
  return {
    id: m?.id ?? m?.member_id ?? m?.membership_id,
    name: m?.full_name ?? m?.name ?? m?.members?.full_name ?? m?.member?.full_name ?? 'Member',
    role: (m?.role ?? 'member') as GroupRole,
    heads: m?.heads ?? 1,
  };
}

type Filter = 'all' | 'officers' | 'members';

export default function MembersOfficers() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [filter, setFilter] = useState<Filter>('all');

  const { data, loading, refetch } = useQuery(() => listMembers(groupId!) as Promise<any[]>, [groupId]);
  const changeRole = useAction((id: string, role: GroupRole) => setMemberRole(groupId!, id, role));

  const rows = useMemo(() => (Array.isArray(data) ? data.map(normalize) : []), [data]);
  const filtered = rows.filter((m) => (filter === 'all' ? true : filter === 'officers' ? m.role !== 'member' : m.role === 'member'));
  const treasurer = rows.find((m) => m.role === 'treasurer');
  const auditor = rows.find((m) => m.role === 'auditor');

  function onPressMember(m: Row) {
    if (m.role === 'owner') return; // owner can't reassign themselves here
    Alert.alert(m.name, 'Change role', [
      { text: 'Make Treasurer', onPress: () => apply(m.id, 'treasurer') },
      { text: 'Make Auditor', onPress: () => apply(m.id, 'auditor') },
      { text: 'Make Member', onPress: () => apply(m.id, 'member') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  async function apply(id: string, role: GroupRole) {
    const ok = await changeRole.run(id, role);
    if (ok !== undefined) refetch();
    else if (changeRole.error) Alert.alert('Could not change role', changeRole.error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Members & Officers" subtitle={`${rows.length} people`} />
      {loading ? (
        <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
      ) : (
        <View style={{ flex: 1, padding: 16, gap: 14 }}>
          {/* Segmented filter */}
          <View style={{ flexDirection: 'row', backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 4 }}>
            {(['all', 'officers', 'members'] as Filter[]).map((f) => (
              <Pressable key={f} onPress={() => setFilter(f)} style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: filter === f ? semantic.surface : 'transparent' }}>
                <Text variant="label" style={{ fontSize: 13, color: filter === f ? semantic.textPrimary : semantic.textSecondary, textTransform: 'capitalize' }}>{f}</Text>
              </Pressable>
            ))}
          </View>

          {/* Officer slots */}
          {filter !== 'members' ? (
            <View style={{ gap: 8 }}>
              <Text variant="label" style={{ fontSize: 12.5, color: semantic.brandDark }}>Officer slots</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {([['Treasurer', treasurer], ['Auditor', auditor]] as const).map(([label, holder]) => (
                  <View key={label} style={{ flex: 1, backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 12, gap: 7 }}>
                    <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '600' }}>{label}</Text>
                    {holder ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Avatar name={holder.name} size={30} />
                        <Text variant="label" style={{ fontSize: 13 }}>{holder.name.split(' ')[0]}</Text>
                      </View>
                    ) : (
                      <Text variant="body" color="muted">Vacant</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* People */}
          <View style={{ gap: 10 }}>
            <Text variant="label" style={{ fontSize: 12.5 }} color="secondary">People</Text>
            {filtered.map((m) => {
              const locked = m.role === 'owner';
              return (
                <Pressable key={m.id} disabled={locked} onPress={() => onPressMember(m)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: semantic.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }, shadowToken.card]}>
                  <Avatar name={m.name} size={40} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="label" style={{ fontSize: 14.5 }}>{m.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <StatusBadge entity="role" value={m.role} />
                      {m.heads > 1 ? <StatusBadge entity="role" value="member" labelOverride={`${m.heads} heads`} /> : null}
                    </View>
                  </View>
                  {!locked ? <ChevronRight size={16} color={semantic.textMuted} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
