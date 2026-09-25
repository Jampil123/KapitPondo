import { useMemo } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BellOff, CheckCircle2, XCircle, Bell, Settings } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic } from '@/theme/colors';
import { useNotifications } from '@/context/NotificationsContext';
import type { Notification } from '@/api/notifications';

function iconFor(type: string) {
  if (type.endsWith('.verified')) return { Icon: CheckCircle2, color: '#3E8E66' };
  if (type.endsWith('.rejected')) return { Icon: XCircle, color: '#C25C5E' };
  return { Icon: Bell, color: semantic.brandDark };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${time}`;
}

function Row({ n, onPress }: { n: Notification; onPress: () => void }) {
  const { Icon, color } = iconFor(n.type);
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: semantic.border }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Icon size={16} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 13, fontFamily: n.is_read ? 'Poppins_500Medium' : 'Poppins_600SemiBold', color: semantic.textPrimary }}>{n.title ?? 'Notification'}</Text>
          <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>{formatWhen(n.created_at)}</Text>
        </View>
        {n.message ? <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{n.message}</Text> : null}
      </View>
      {!n.is_read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.brand, marginTop: 6 }} /> : null}
    </Pressable>
  );
}

export default function Notifications() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  const { notifications: allNotifications, loading, error, markRead, markAllRead } = useNotifications();

  const notifications = useMemo(
    () => (groupId ? allNotifications.filter((n) => n.group_id === null || n.group_id === groupId) : allNotifications),
    [allNotifications, groupId],
  );
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function onPressRow(n: Notification) {
    if (n.is_read) return;
    await markRead(n.id);
  }

  async function onMarkAllRead() {
    // Scoped: mark only what's shown here, not every unread notification the
    // member has across every group — the backend's read-all endpoint has no
    // group filter, so a plain markAllRead() would over-mark other groups.
    if (!groupId) return markAllRead();
    await Promise.all(notifications.filter((n) => !n.is_read).map((n) => markRead(n.id)));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {unreadCount > 0 ? (
              <Pressable onPress={onMarkAllRead} hitSlop={8} style={{ paddingHorizontal: 8 }}>
                <Text variant="label" style={{ fontSize: 13, color: semantic.brandDark }}>Mark all read</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.push('/(app)/notification-center' as any)} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Settings size={16} color={semantic.brandDark} />
            </Pressable>
          </View>
        }
      />

      {loading && notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : error && notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>Couldn’t load notifications. {error.message}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 10 }}>
          <BellOff size={40} color={semantic.textMuted} />
          <Text variant="h3" style={{ fontSize: 16 }}>No notifications yet</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            You’ll see updates here — like identity verification results — as they happen.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
          {notifications.map((n) => (
            <Row key={n.id} n={n} onPress={() => onPressRow(n)} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
