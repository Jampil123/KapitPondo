import { useMemo, useState } from 'react';
import { View, ScrollView, TextInput, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Search, MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useQuery } from '@/hooks/useApi';
import { listMemberDirectory } from '@/api/groups';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor' };

export default function AllMembers() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const [query, setQuery] = useState('');

  const members = directory.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = directory.data ?? [];
    return q ? list.filter((m) => (m.full_name ?? '').toLowerCase().includes(q)) : list;
  }, [directory.data, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Members" />
      <View style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surfaceAlt, borderRadius: 14, paddingHorizontal: 16, minHeight: 50 }}>
          <Search size={20} color={semantic.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search members"
            placeholderTextColor={semantic.textMuted}
            style={{ flex: 1, fontSize: 15, color: semantic.textPrimary, paddingVertical: 12, paddingHorizontal: 0 }}
          />
        </View>

        {directory.data ? (
          <Text variant="caption" color="secondary" style={{ marginTop: 16, marginLeft: 4 }}>
            {query ? `${filtered.length} of ${members.length}` : members.length} member{members.length === 1 ? '' : 's'}
          </Text>
        ) : null}

        {directory.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : filtered.length === 0 ? (
          <Text variant="body" color="muted" style={{ textAlign: 'center', marginTop: 30 }}>
            {query ? 'No members match your search.' : 'No members yet.'}
          </Text>
        ) : (
          <ScrollView style={{ flex: 1, marginTop: 10, marginHorizontal: -6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {filtered.map((m, i) => {
              const isMe = m.member_id === member?.id;
              const open = selected === m.member_id && !isMe;
              return (
                <Pressable
                  key={`${m.member_id}-${i}`}
                  onPress={() => setSelected(open ? null : m.member_id)}
                  disabled={isMe}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 14,
                    backgroundColor: open ? semantic.surfaceAlt : 'transparent',
                  }}
                >
                  <Avatar name={m.full_name ?? 'Member'} uri={m.avatar_url} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>
                      {m.full_name ?? 'Unnamed'}{isMe ? <Text style={{ color: semantic.brandDark }}> · you</Text> : null}
                    </Text>
                    <Text variant="caption" color="secondary">{m.heads} head{m.heads === 1 ? '' : 's'}{ROLE_LABEL[m.role] ? ` · ${ROLE_LABEL[m.role]}` : ''}</Text>
                  </View>
                  {open ? (
                    <Pressable
                      onPress={() => router.push({ pathname: '/(app)/[groupId]/dm/[memberId]' as any, params: { groupId, memberId: m.member_id } })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: intent.primary.strong, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20 }}
                    >
                      <MessageCircle size={14} color="#fff" strokeWidth={2.4} />
                      <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Chat</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
