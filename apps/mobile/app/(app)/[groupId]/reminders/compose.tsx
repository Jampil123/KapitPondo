/**
 * app/(app)/[groupId]/reminders/compose.tsx — Owner/Treasurer payment
 * reminder. Unlike announcements.tsx's composer this never creates a
 * group-readable record: POST /api/groups/:groupId/members/remind fans out
 * one private `notifications` row per member who hasn't paid this period
 * (see announcements.service.js's resolveUnpaidMembers) — nobody else, not
 * even other officers, sees who received it.
 */
import { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useUnpaidMembers, useSendReminder } from '@/features/announcements/announcements.hooks';

const TEMPLATE = 'Paalala po: hindi pa po natatanggap ang contribution ninyo ngayong period. Kung may problema, message niyo lang ako.';
const MAX_LEN = 500;

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="muted" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

export default function ComposeReminder() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { role, group } = useActiveGroup();
  const unpaid = useUnpaidMembers(groupId);
  const send = useSendReminder(groupId!);
  const [body, setBody] = useState(TEMPLATE);

  const allowed = role === 'owner' || role === 'treasurer';
  useEffect(() => {
    if (role && !allowed) router.back();
  }, [role, allowed]);
  if (!role || !allowed) return null;

  const members = unpaid.data ?? [];

  async function onSend() {
    const trimmed = body.trim();
    if (!trimmed) return Alert.alert('Write a message first');
    if (members.length === 0) return Alert.alert('Nobody to remind', 'Every active member has paid this period.');
    const result = await send.run(trimmed);
    if (result) {
      Alert.alert('Reminder sent', `Sent privately to ${result.sent_count} member${result.sent_count === 1 ? '' : 's'}.`);
      router.back();
    } else if (send.error) {
      Alert.alert("Couldn't send", send.error.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Send a reminder" subtitle={group?.name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13 }}>
          <Info size={16} color={semantic.brandDark} style={{ marginTop: 1 }} />
          <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 17 }}>
            Each reminder is sent privately. Nobody else sees who is behind, and nothing is posted to the group chat.
          </Text>
        </View>

        <SectionHead title="Message" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
          <TextInput
            value={body}
            onChangeText={(v) => setBody(v.slice(0, MAX_LEN))}
            multiline
            placeholder="Write your reminder…"
            placeholderTextColor={semantic.textMuted}
            style={{ minHeight: 80, fontSize: 14, lineHeight: 20, color: semantic.textPrimary }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: semantic.border }}>
            <Text variant="caption" color="muted">{body.length} / {MAX_LEN}</Text>
          </View>
        </View>

        <SectionHead title="Who receives it" aside={`${members.length} member${members.length === 1 ? '' : 's'}`} />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
          {unpaid.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 20 }} />
          ) : members.length === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>Everyone has paid this period.</Text>
          ) : (
            members.map((m, i) => (
              <View key={m.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i === members.length - 1 ? 0 : 1, borderColor: semantic.border }}>
                <Avatar name={m.full_name} size={36} />
                <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{m.full_name ?? 'Unnamed'}</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ backgroundColor: semantic.dashCard, borderRadius: 16, padding: 15, marginTop: 20 }}>
          <Text variant="overline" style={{ color: '#88A9B6' }}>How it will look</Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginTop: 8, borderLeftWidth: 3, borderLeftColor: intent.warning.base }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#E0B872', textTransform: 'uppercase' }}>Payment reminder</Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: '#E4EEF2', marginTop: 5 }}>{body.trim() || 'Your message…'}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 20, backgroundColor: semantic.background }}>
        <Pressable
          onPress={onSend}
          disabled={send.loading || !body.trim() || members.length === 0}
          style={{ backgroundColor: semantic.dashCard, borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: send.loading || !body.trim() || members.length === 0 ? 0.6 : 1 }}
        >
          {send.loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Send to {members.length} member{members.length === 1 ? '' : 's'}</Text>}
        </Pressable>
        <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: 9 }}>Each one receives it privately</Text>
      </View>
    </SafeAreaView>
  );
}
