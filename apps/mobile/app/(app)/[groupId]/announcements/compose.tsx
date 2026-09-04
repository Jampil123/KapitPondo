/**
 * app/(app)/[groupId]/announcements/compose.tsx — Owner-only announcement
 * composer. Posts to POST /api/groups/:groupId/announcements (see
 * services/api/src/modules/announcements) — a real broadcast: it inserts a
 * group-readable `announcements` row and (unless push is switched off) sends
 * a push+notification-center entry to every resolved recipient.
 */
import { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Switch, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useCreateAnnouncement } from '@/features/announcements/announcements.hooks';
import { useQuery } from '@/hooks/useApi';
import { listOfficers } from '@/api/groups';
import { listUnpaidMembers } from '@/api/announcements';
import type { AnnouncementType, AnnouncementAudience } from '@/api/announcements';

const TYPES: { key: AnnouncementType; label: string; template: string }[] = [
  { key: 'reminder', label: 'Payment reminder', template: 'Reminder po: contributions are due soon. Kung may problema sa pagbayad, message niyo lang ang Treasurer bago mag-due date.' },
  { key: 'meeting', label: 'Meeting', template: 'May meeting tayo — [day], [time] sa [venue]. Pag-uusapan natin ang mga susunod na hakbang.' },
  { key: 'cycle', label: 'Cycle update', template: 'May update tungkol sa kasalukuyang cycle ng grupo.' },
  { key: 'urgent', label: 'Urgent', template: 'Mahalagang paalala mula sa grupo.' },
];

const MAX_LEN = 1000;

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="muted" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

export default function ComposeAnnouncement() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { role, group } = useActiveGroup();
  const create = useCreateAnnouncement(groupId!);
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);
  const unpaid = useQuery(() => listUnpaidMembers(groupId!), [groupId]);

  const [type, setType] = useState<AnnouncementType>('reminder');
  const [body, setBody] = useState(TYPES[0].template);
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [sendPush, setSendPush] = useState(true);

  useEffect(() => {
    if (role && role !== 'owner') router.back();
  }, [role]);
  if (role !== 'owner') return null;

  const totalMembers = officers.data?.member_count ?? 0;
  const officerCount = officers.data?.officers.length ?? 0;
  const unpaidCount = unpaid.data?.length ?? 0;

  const AUDIENCE_OPTIONS: { key: AnnouncementAudience; label: string; sub: string }[] = [
    { key: 'all', label: 'Everyone', sub: `All ${totalMembers || '—'} members in the group` },
    { key: 'unpaid', label: "Only members who haven't paid", sub: unpaid.loading ? 'Checking…' : `${unpaidCount} member${unpaidCount === 1 ? '' : 's'} · nobody else sees who they are` },
    { key: 'officers', label: 'Only officers', sub: `${officerCount} officer${officerCount === 1 ? '' : 's'}` },
  ];

  const recipientCount = audience === 'all' ? totalMembers : audience === 'unpaid' ? unpaidCount : officerCount;

  function pickType(t: AnnouncementType) {
    setType(t);
    setBody(TYPES.find((x) => x.key === t)!.template);
  }

  async function onPost() {
    const trimmed = body.trim();
    if (!trimmed) return Alert.alert('Write a message first');
    const result = await create.run({ type, body: trimmed, audience, send_push: sendPush });
    if (result) {
      Alert.alert('Announcement posted', `Sent to ${result.announcement.recipient_count} member${result.announcement.recipient_count === 1 ? '' : 's'}.`);
      router.back();
    } else if (create.error) {
      Alert.alert("Couldn't post", create.error.message);
    }
  }

  const preview = body.trim().slice(0, 160) + (body.trim().length > 160 ? '…' : '');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="New announcement" subtitle={group?.name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SectionHead title="What kind" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {TYPES.map((t) => {
            const active = t.key === type;
            return (
              <Pressable
                key={t.key}
                onPress={() => pickType(t.key)}
                style={{
                  paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20,
                  backgroundColor: active ? semantic.dashCard : semantic.surface,
                  borderWidth: 1.5, borderColor: active ? semantic.dashCard : semantic.border,
                }}
              >
                <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionHead title="Message" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
          <TextInput
            value={body}
            onChangeText={(v) => setBody(v.slice(0, MAX_LEN))}
            multiline
            placeholder="Write your announcement…"
            placeholderTextColor={semantic.textMuted}
            style={{ minHeight: 90, fontSize: 14, lineHeight: 20, color: semantic.textPrimary }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: semantic.border }}>
            <Text variant="caption" color="muted">{body.length} / {MAX_LEN}</Text>
          </View>
        </View>

        <SectionHead title="Who receives it" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
          {AUDIENCE_OPTIONS.map((o, i) => {
            const checked = audience === o.key;
            return (
              <Pressable
                key={o.key}
                onPress={() => setAudience(o.key)}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderBottomWidth: i === AUDIENCE_OPTIONS.length - 1 ? 0 : 1, borderColor: semantic.border }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: checked ? semantic.brandDark : semantic.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {checked ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: semantic.brandDark }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{o.label}</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>{o.sub}</Text>
                </View>
              </Pressable>
            );
          })}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderColor: semantic.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>Send a push notification</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Otherwise they'll see it next time they open the app</Text>
            </View>
            <Switch value={sendPush} onValueChange={setSendPush} trackColor={{ false: semantic.surfaceAlt, true: intent.success.base }} thumbColor="#fff" />
          </View>
        </View>

        <View style={{ backgroundColor: semantic.dashCard, borderRadius: 16, padding: 15, marginTop: 20 }}>
          <Text variant="overline" style={{ color: '#88A9B6' }}>How it will look</Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, marginTop: 8, borderLeftWidth: 3, borderLeftColor: intent.warning.base }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#E0B872', textTransform: 'uppercase' }}>
              {TYPES.find((t) => t.key === type)?.label}
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: '#E4EEF2', marginTop: 5 }}>{preview || 'Your message…'}</Text>
          </View>
          <Text style={{ fontSize: 11, color: '#7E9CAA', fontWeight: '600', marginTop: 11 }}>
            sending to {recipientCount || '—'} member{recipientCount === 1 ? '' : 's'}
          </Text>
        </View>
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 20, backgroundColor: semantic.background }}>
        <Pressable
          onPress={onPost}
          disabled={create.loading || !body.trim()}
          style={{ backgroundColor: semantic.dashCard, borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: create.loading || !body.trim() ? 0.6 : 1 }}
        >
          {create.loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Post announcement</Text>}
        </Pressable>
        <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: 9 }}>
          {recipientCount || 0} member{recipientCount === 1 ? '' : 's'} will be notified
        </Text>
      </View>
    </SafeAreaView>
  );
}
