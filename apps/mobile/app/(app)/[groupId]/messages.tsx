import { useState, type ReactNode } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Megaphone, MessageCircle, Users, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { usePresentMembers } from '@/context/PresenceContext';
import { can, type GroupRole } from '@/constants/roles';
import { useQuery } from '@/hooks/useApi';
import { listMemberDirectory } from '@/api/groups';
import { listMessages } from '@/api/messages';
import { listDirectMessages } from '@/api/directMessages';
import { useAnnouncements } from '@/features/announcements/announcements.hooks';

const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Owner', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

/** Compact relative time — "2d", "1h", "6h", "1w" — matching a chat-list convention. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return `${Math.floor(day / 7)}w`;
}

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="muted" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function IconTile({ icon: Icon, bg, color }: { icon: any; bg: string; color: string }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={19} color={color} />
    </View>
  );
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'Unnamed';
  const parts = full.trim().split(/\s+/);
  return parts.length <= 2 ? full.trim() : parts[0];
}

function AvatarCircle({ name, label, online }: { name: string | null | undefined; label: string; online: boolean }) {
  return (
    <View style={{ alignItems: 'center', width: 64 }}>
      <View>
        <Avatar name={name} size={52} />
        {online ? (
          <View style={{
            position: 'absolute', bottom: -1, right: -1, width: 15, height: 15, borderRadius: 8,
            backgroundColor: intent.success.base, borderWidth: 2, borderColor: semantic.background,
          }} />
        ) : null}
      </View>
      <Text variant="caption" color="secondary" numberOfLines={1} style={{ marginTop: 5, fontSize: 10.5, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function AvatarStrip({ groupId }: { groupId: string | undefined }) {
  const { member } = useAuth();
  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const present = usePresentMembers();

  const onlineIds = new Set(present.filter((p) => p.member_id !== member?.id).map((p) => p.member_id));
  const others = (directory.data ?? [])
    .filter((m) => m.member_id !== member?.id)
    .sort((a, b) => Number(onlineIds.has(b.member_id)) - Number(onlineIds.has(a.member_id)));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingVertical: 4, paddingRight: 8 }}>
      <AvatarCircle name={member?.full_name} label="You" online />
      {others.map((m) => (
        <AvatarCircle key={m.member_id} name={m.full_name} label={firstName(m.full_name)} online={onlineIds.has(m.member_id)} />
      ))}
    </ScrollView>
  );
}

function previewLine(body: string, imageUrl: string | null): string {
  return body || (imageUrl ? '📷 Photo' : '');
}

function ContactRow({ groupId, myMemberId, memberId, name, roleLabel, onPress }: {
  groupId: string | undefined; myMemberId: string | undefined; memberId: string; name: string | null;
  roleLabel?: string; onPress: () => void;
}) {
  const dm = useQuery(() => listDirectMessages(groupId!, memberId, { limit: 1 }), [groupId, memberId]);
  const latest = dm.data?.[0];
  const preview = latest
    ? (latest.sender_id === myMemberId ? `You: ${previewLine(latest.body, latest.image_url)}` : previewLine(latest.body, latest.image_url))
    : undefined;

  return (
    <Row
      left={<Avatar name={name} size={44} />}
      title={name ?? roleLabel ?? 'Unnamed'}
      time={latest ? timeAgo(latest.created_at) : undefined}
      subtitle={roleLabel}
      preview={preview}
      onPress={onPress}
    />
  );
}

function Row({ left, title, time, subtitle, preview, isSoon, onPress }: {
  left: ReactNode; title: string; time?: string; subtitle?: string; preview?: string;
  isSoon?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8,
        opacity: isSoon ? 0.7 : 1,
      }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{title}</Text>
          {time ? <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textMuted }}>{time}</Text> : null}
        </View>
        {subtitle ? <Text variant="caption" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
        {preview ? <Text variant="caption" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>{preview}</Text> : null}
      </View>
      {isSoon ? <Text variant="caption" color="muted">Soon</Text> : null}
    </Pressable>
  );
}

const GRADIENT = ['#6CC5FF', '#2FA8FF', '#0F7FE0'] as const;

export default function Messages() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { role, group } = useActiveGroup();
  const { member } = useAuth();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const canOfficersRoom = can(role, 'viewOfficersChat');

  const lastGeneral = useQuery(() => listMessages(groupId!, 'general', { limit: 1 }), [groupId]);
  const lastOfficers = useQuery(
    () => (canOfficersRoom ? listMessages(groupId!, 'officers', { limit: 1 }) : Promise.resolve([])),
    [groupId, canOfficersRoom],
  );
  const announcements = useAnnouncements(groupId);

  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);

  const contactableOfficers = (directory.data ?? [])
    .filter((m) => m.member_id !== member?.id && m.role !== 'member')
    .filter((m) => matches(m.full_name ?? ROLE_LABEL[m.role]));
  const contactableMembers = (directory.data ?? [])
    .filter((m) => m.member_id !== member?.id && m.role === 'member')
    .filter((m) => matches(m.full_name ?? 'Member'));

  const showAnnouncements = matches('announcements');
  const showGroupChat = matches('group chat');
  const showOfficersRoom = canOfficersRoom && matches('officers room');

  const nothingFound = !!q && !showAnnouncements && !showGroupChat && !showOfficersRoom
    && contactableOfficers.length === 0 && contactableMembers.length === 0
    && !directory.loading;

  function go(route: string) {
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      directory.refetch(),
      lastGeneral.refetch(),
      lastOfficers.refetch(),
      announcements.refetch(),
    ]);
    setRefreshing(false);
  }

  const composeRoute = role === 'owner' ? 'announcements/compose' : role === 'treasurer' ? 'reminders/compose' : null;
  const latestAnnouncement = announcements.data?.[0];
  const latestGeneral = lastGeneral.data?.[0];
  const latestOfficers = lastOfficers.data?.[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar
        title="Messages"
        subtitle={role ? (role === 'member' ? group?.name ?? undefined : `${ROLE_LABEL[role]} · ${group?.name ?? ''}`) : undefined}
        right={composeRoute ? (
          <Pressable onPress={() => go(composeRoute)} hitSlop={8}>
            <LinearGradient
              colors={GRADIENT}
              locations={[0, 0.55, 1]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={{
                width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                shadowColor: '#2FA8FF', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 5,
              }}
            >
              <Plus size={18} color="#fff" strokeWidth={2.4} />
            </LinearGradient>
          </Pressable>
        ) : (
          <Avatar name={member?.full_name} size={38} />
        )}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[semantic.brand]} tintColor={semantic.brand} />}
      >
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 }, shadowToken.card]}>
          <Search size={16} color={semantic.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people and messages"
            placeholderTextColor={semantic.textMuted}
            style={{ flex: 1, fontSize: 13.5, color: semantic.textPrimary, padding: 0 }}
          />
        </View>

        <View style={{ marginTop: 14 }}>
          <AvatarStrip groupId={groupId} />
        </View>

        {showAnnouncements || showGroupChat ? (
          <>
            <SectionHead title="Pinned" />
            <View>
              {showAnnouncements ? (
                <Row
                  left={<IconTile icon={Megaphone} bg={intent.warning.soft} color={intent.warning.text} />}
                  title="Announcements"
                  time={latestAnnouncement ? timeAgo(latestAnnouncement.created_at) : undefined}
                  subtitle="From the Owner · you can't reply"
                  preview={latestAnnouncement ? latestAnnouncement.body : undefined}
                  onPress={() => go('announcements')}
                />
              ) : null}
              {showGroupChat ? (
                <Row
                  left={<IconTile icon={MessageCircle} bg={semantic.dashCard} color="#fff" />}
                  title="Group chat"
                  time={latestGeneral ? timeAgo(latestGeneral.created_at) : undefined}
                  subtitle="Everyone in the group"
                  preview={latestGeneral ? `${latestGeneral.sender_name}: ${previewLine(latestGeneral.body, latestGeneral.image_url)}` : undefined}
                  onPress={() => go('chat/general')}
                />
              ) : null}
            </View>
          </>
        ) : null}

        {showOfficersRoom ? (
          <>
            <SectionHead title="Officers" />
            <View>
              <Row
                left={<IconTile icon={Users} bg={semantic.surfaceAlt} color={semantic.brandDark} />}
                title="Officers room"
                time={latestOfficers ? timeAgo(latestOfficers.created_at) : undefined}
                subtitle="Owner, Treasurer & Auditor"
                preview={latestOfficers ? `${latestOfficers.sender_name}: ${previewLine(latestOfficers.body, latestOfficers.image_url)}` : undefined}
                onPress={() => go('chat/officers')}
              />
            </View>
          </>
        ) : null}

        {directory.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} />
        ) : contactableOfficers.length ? (
          <>
            <SectionHead title="Contact an officer" />
            <View>
              {contactableOfficers.map((o) => (
                <ContactRow
                  key={o.member_id}
                  groupId={groupId}
                  myMemberId={member?.id}
                  memberId={o.member_id}
                  name={o.full_name}
                  roleLabel={ROLE_LABEL[o.role]}
                  onPress={() => go(`dm/${o.member_id}`)}
                />
              ))}
            </View>
          </>
        ) : null}

        {directory.loading ? null : contactableMembers.length ? (
          <>
            <SectionHead title="Members" />
            <View>
              {contactableMembers.map((m) => (
                <ContactRow
                  key={m.member_id}
                  groupId={groupId}
                  myMemberId={member?.id}
                  memberId={m.member_id}
                  name={m.full_name}
                  onPress={() => go(`dm/${m.member_id}`)}
                />
              ))}
            </View>
          </>
        ) : null}

        {nothingFound ? (
          <Text variant="body" color="muted" style={{ textAlign: 'center', marginTop: 40 }}>No matches for "{query}".</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
