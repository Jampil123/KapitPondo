import { useCallback, useState, type ReactNode } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Megaphone, MessageCircle, Users, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { usePresentMembers } from '@/context/PresenceContext';
import type { GroupRole } from '@/constants/roles';
import type { ChatMessage } from '@/api/messages';
import type { RoomReader } from '@/api/chatReads';
import type { DirectMessage } from '@/api/directMessages';
import { useRoomReaders, hasSeen, seenBy } from '@/features/chat/chatSeen';
import { useChatOverview } from '@/features/chat/chatOverview';
import { useMemberDirectory, usePrefetchConversations } from '@/features/chat/chatCache';
import { PillFilters } from '@/components/shared/PillFilters';

const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

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
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, marginBottom: 2, paddingHorizontal: 2 }}>
      <Text variant="overline" color="muted" style={{ letterSpacing: 0.8 }}>{title}</Text>
      {aside ? <Text variant="caption" style={{ fontFamily: 'Poppins_600SemiBold', color: semantic.brand }}>{aside}</Text> : null}
    </View>
  );
}

type Section = 'groups' | 'officers' | 'members';
type Filter = 'all' | 'unread' | Section;

const SECTION_TITLE: Record<Section, string> = { groups: 'Group chats', officers: 'Officers', members: 'Members' };

interface ChatItem {
  key: string;
  section: Section;
  at: string | undefined;
  unread: boolean;
  /** Name/title and latest message, for search. */
  text: string;
  node: ReactNode;
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

function AvatarCircle({ name, uri, label, online }: { name: string | null | undefined; uri?: string | null; label: string; online: boolean }) {
  return (
    <View style={{ alignItems: 'center', width: 64 }}>
      <View>
        <Avatar name={name} uri={uri} size={52} />
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
  const directory = useMemberDirectory(groupId);
  const present = usePresentMembers();

  const onlineIds = new Set(present.filter((p) => p.member_id !== member?.id).map((p) => p.member_id));
  const others = (directory.data ?? [])
    .filter((m) => m.member_id !== member?.id)
    .sort((a, b) => Number(onlineIds.has(b.member_id)) - Number(onlineIds.has(a.member_id)));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2, paddingVertical: 4, paddingRight: 8 }}>
      <AvatarCircle name={member?.full_name} uri={member?.avatar_url} label="You" online />
      {others.map((m) => (
        <AvatarCircle key={m.member_id} name={m.full_name} uri={m.avatar_url} label={firstName(m.full_name)} online={onlineIds.has(m.member_id)} />
      ))}
    </ScrollView>
  );
}

function previewLine(body: string, imageUrl: string | null): string {
  return body || (imageUrl ? '📷 Photo' : '');
}

function ContactRow({ latest, myMemberId, name, avatarUrl, roleLabel, online, unread, theirReadAt, onPress }: {
  latest: DirectMessage | undefined; myMemberId: string | undefined; name: string | null; avatarUrl?: string | null;
  roleLabel?: string; online: boolean; unread: boolean; theirReadAt: string | undefined; onPress: () => void;
}) {
  const fromMe = latest?.sender_id === myMemberId;
  const status = fromMe && latest ? (hasSeen(theirReadAt, latest.created_at) ? ' · Seen' : ' · Sent') : '';
  const preview = latest ? `${fromMe ? 'You: ' : ''}${previewLine(latest.body, latest.image_url)}${status}` : undefined;
  return (
    <Row
      left={
        <View>
          <Avatar name={name} uri={avatarUrl} size={44} />
          {online ? (
            <View style={{
              position: 'absolute', bottom: -1, right: -1, width: 13, height: 13, borderRadius: 7,
              backgroundColor: intent.success.base, borderWidth: 2, borderColor: semantic.background,
            }} />
          ) : null}
        </View>
      }
      title={name ?? roleLabel ?? 'Unnamed'}
      time={latest ? timeAgo(latest.created_at) : undefined}
      subtitle={roleLabel}
      preview={preview}
      unread={unread}
      onPress={onPress}
    />
  );
}

function Row({ left, title, time, subtitle, preview, unread, onPress }: {
  left: ReactNode; title: string; time?: string; subtitle?: string; preview?: string; unread?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13.5, fontFamily: unread ? 'Poppins_700Bold' : 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{title}</Text>
          {time ? (
            <Text style={{ fontSize: 10.5, fontFamily: unread ? 'Poppins_700Bold' : 'Poppins_500Medium', color: unread ? semantic.brand : semantic.textMuted }}>{time}</Text>
          ) : null}
        </View>
        {subtitle ? <Text variant="caption" color="muted" style={{ marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
        {preview ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text
              variant="caption"
              style={{ flex: 1, fontFamily: unread ? 'Poppins_600SemiBold' : 'Poppins_400Regular', color: unread ? semantic.textPrimary : semantic.textSecondary }}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: semantic.brand }} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Newest conversation first; ones with no messages keep their order at the bottom. */
function byRecent<T>(items: T[], at: (t: T) => string | undefined) {
  return items
    .map((t, i) => {
      const iso = at(t);
      return { t, i, ts: iso ? Date.parse(iso) : -Infinity };
    })
    .sort((x, y) => (y.ts - x.ts) || (x.i - y.i))
    .map((x) => x.t);
}

const GRADIENT = ['#6CC5FF', '#2FA8FF', '#0F7FE0'] as const;

export default function Messages() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { role } = useActiveGroup();
  const { member } = useAuth();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const {
    directory, others, canOfficersRoom, reads,
    latestAnnouncement, latestGeneral, latestOfficers, latestDm,
    unread: unreadOf, refetch: refetchChats,
  } = useChatOverview(groupId);
  usePrefetchConversations(
    groupId, member?.id,
    canOfficersRoom ? ['general', 'officers'] : ['general'],
    others.map((m) => m.member_id),
  );
  const [filter, setFilter] = useState<Filter>('all');
  const present = usePresentMembers();
  const onlineIds = new Set(present.map((p) => p.member_id));
  const generalReaders = useRoomReaders(groupId, 'general');
  const officersReaders = useRoomReaders(groupId, 'officers', canOfficersRoom);
  // Coming back from a chat (or any other screen) picks up the latest messages,
  // so the order and unread state are current.
  const [focusedOnce, setFocusedOnce] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce) { setFocusedOnce(true); return; }
      refetchChats();
      generalReaders.refetch();
      officersReaders.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusedOnce]),
  );

  const q = query.trim().toLowerCase();

  // "You: hi · Seen by 3" when the newest message is the viewer's; otherwise "Ana: hi".
  function roomPreview(m: ChatMessage, readers: RoomReader[]) {
    const text = previewLine(m.body, m.image_url);
    if (m.sender_id !== member?.id) return `${m.sender_name}: ${text}`;
    const n = seenBy(readers, m, member?.id).length;
    return `You: ${text} · ${n ? `Seen by ${n}` : 'Sent'}`;
  }

  function go(route: string) {
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchChats(), generalReaders.refetch(), officersReaders.refetch()]);
    setRefreshing(false);
  }

  const composeRoute = role === 'owner' ? 'announcements/compose' : role === 'treasurer' ? 'reminders/compose' : null;

  const items: ChatItem[] = [];
  {
    const unread = unreadOf.announcements;
    items.push({
      key: 'announcements', section: 'groups', at: latestAnnouncement?.created_at, unread,
      text: `announcements ${latestAnnouncement?.body ?? ''}`,
      node: (
        <Row
          key="announcements"
          left={<IconTile icon={Megaphone} bg={intent.warning.soft} color={intent.warning.text} />}
          title="Announcements"
          time={latestAnnouncement ? timeAgo(latestAnnouncement.created_at) : undefined}
          subtitle="From the Organizer · you can't reply"
          preview={latestAnnouncement?.body}
          unread={unread}
          onPress={() => go('announcements')}
        />
      ),
    });
  }
  {
    const unread = unreadOf.general;
    const preview = latestGeneral ? roomPreview(latestGeneral, generalReaders.data ?? []) : undefined;
    items.push({
      key: 'general', section: 'groups', at: latestGeneral?.created_at, unread,
      text: `group chat ${preview ?? ''}`,
      node: (
        <Row
          key="general"
          left={<IconTile icon={MessageCircle} bg={semantic.dashCard} color="#fff" />}
          title="Group chat"
          time={latestGeneral ? timeAgo(latestGeneral.created_at) : undefined}
          subtitle="Everyone in the group"
          preview={preview}
          unread={unread}
          onPress={() => go('chat/general')}
        />
      ),
    });
  }
  if (canOfficersRoom) {
    const unread = unreadOf.officers;
    const preview = latestOfficers ? roomPreview(latestOfficers, officersReaders.data ?? []) : undefined;
    items.push({
      key: 'officers', section: 'groups', at: latestOfficers?.created_at, unread,
      text: `officers room ${preview ?? ''}`,
      node: (
        <Row
          key="officers"
          left={<IconTile icon={Users} bg={semantic.surfaceAlt} color={semantic.brandDark} />}
          title="Officers room"
          time={latestOfficers ? timeAgo(latestOfficers.created_at) : undefined}
          subtitle="Organizer, Treasurer & Auditor"
          preview={preview}
          unread={unread}
          onPress={() => go('chat/officers')}
        />
      ),
    });
  }
  for (const m of others) {
    const latest = latestDm(m.member_id);
    const unread = unreadOf.dm(m.member_id);
    const isOfficer = m.role !== 'member';
    items.push({
      key: `dm:${m.member_id}`, section: isOfficer ? 'officers' : 'members', at: latest?.created_at, unread,
      text: `${m.full_name ?? ROLE_LABEL[m.role]} ${latest?.body ?? ''}`,
      node: (
        <ContactRow
          key={m.member_id}
          latest={latest}
          myMemberId={member?.id}
          name={m.full_name}
          avatarUrl={m.avatar_url}
          roleLabel={isOfficer ? ROLE_LABEL[m.role] : undefined}
          online={onlineIds.has(m.member_id)}
          unread={unread}
          theirReadAt={reads.data?.theirs[m.member_id]}
          onPress={() => go(`dm/${m.member_id}`)}
        />
      ),
    });
  }

  const searched = items.filter((i) => !q || i.text.toLowerCase().includes(q));
  const unreadCount = searched.filter((i) => i.unread).length;
  const countIn = (sec: Section) => searched.filter((i) => i.section === sec).length;
  const FILTERS: { key: Filter; label: string; count?: number; hot?: boolean }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', count: unreadCount, hot: true },
    { key: 'groups', label: 'Groups' },
    ...(countIn('officers') ? [{ key: 'officers' as const, label: 'Officers' }] : []),
    ...(countIn('members') ? [{ key: 'members' as const, label: 'Members' }] : []),
  ];
  const shown = searched.filter((i) => filter === 'all' || (filter === 'unread' ? i.unread : i.section === filter));
  const sections = (['groups', 'officers', 'members'] as Section[])
    .map((sec) => ({ sec, list: byRecent(shown.filter((i) => i.section === sec), (i) => i.at) }))
    .filter((g) => g.list.length > 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      {/* Same steel band as the dashboard header (BandHeader draws the status-bar inset itself). */}
      <BandHeader
        title="Messages"
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
          <Avatar name={member?.full_name} uri={member?.avatar_url} size={38} />
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

        <View style={{ marginTop: 12 }}>
          <PillFilters<Filter> options={FILTERS} value={filter} onChange={setFilter} />
        </View>

        {directory.loading && !directory.data ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : sections.length === 0 ? (
          <Text variant="body" color="muted" style={{ textAlign: 'center', marginTop: 40 }}>
            {q ? `No matches for \u201c${query.trim()}\u201d.` : filter === 'unread' ? "You're all caught up." : 'No chats here yet.'}
          </Text>
        ) : (
          sections.map(({ sec, list }) => {
            const unreadHere = list.filter((i) => i.unread).length;
            return (
              <View key={sec}>
                <SectionHead title={SECTION_TITLE[sec]} aside={unreadHere ? `${unreadHere} unread` : undefined} />
                {list.map((i) => i.node)}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
