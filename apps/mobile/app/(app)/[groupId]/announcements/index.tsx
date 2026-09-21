import { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Plus, Megaphone } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useAnnouncements } from '@/features/announcements/announcements.hooks';
import type { Announcement, AnnouncementType } from '@/api/announcements';

const TYPE_LABEL: Record<AnnouncementType, string> = {
  reminder: 'Payment reminder', meeting: 'Meeting', cycle: 'Cycle update', urgent: 'Urgent',
};
const TYPE_TONE: Record<AnnouncementType, typeof intent[keyof typeof intent]> = {
  reminder: intent.warning, meeting: intent.info, cycle: intent.accent, urgent: intent.danger,
};
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function AnnouncementCard({ a }: { a: Announcement }) {
  const tone = TYPE_TONE[a.type];
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, borderLeftWidth: 3, borderLeftColor: tone.base }, shadowToken.card]}>
      <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: tone.text, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {TYPE_LABEL[a.type]}
      </Text>
      <Text style={{ fontSize: 13.5, lineHeight: 19, color: semantic.textPrimary, marginTop: 6 }}>{a.body}</Text>
      <Text variant="caption" color="muted" style={{ marginTop: 10 }}>
        {a.sender_name} · {ROLE_LABEL[a.sender_role] ?? a.sender_role} · {shortDate(a.created_at)}
      </Text>
    </View>
  );
}

export default function Announcements() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { role } = useActiveGroup();
  const announcements = useAnnouncements(groupId);
  const [refreshing, setRefreshing] = useState(false);

  const items = announcements.data ?? [];
  const isOwner = role === 'owner';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar
        title="Announcements"
        right={isOwner ? (
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/[groupId]/announcements/compose' as any, params: { groupId } })}
            hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: semantic.dashCard, alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={18} color="#fff" />
          </Pressable>
        ) : undefined}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await announcements.refetch(); setRefreshing(false); }}
          />
        }
      >
        {announcements.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 50, gap: 10 }}>
            <Megaphone size={36} color={semantic.textMuted} />
            <Text variant="h3" style={{ fontSize: 15 }}>No announcements yet</Text>
          </View>
        ) : (
          items.map((a) => <AnnouncementCard key={a.id} a={a} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
