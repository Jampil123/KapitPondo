/**
 * app/(app)/notifications.tsx — Notification Center.
 * Lists every notification written by lib/notifications.js on the backend
 * (identity verify/reject, membership reject, and whatever future modules
 * wire in) — newest first, tap to mark read, "Mark all read" in the header.
 * Reads from NotificationsContext, which keeps the list live over Supabase
 * Realtime — no local fetch/refetch of its own.
 */
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellOff, CheckCircle2, XCircle, Bell } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
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
      style={[
        { flexDirection: 'row', gap: 12, backgroundColor: semantic.surface, borderRadius: 16, padding: 14 },
        shadowToken.card,
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text variant="label" style={{ flex: 1, fontSize: 14.5 }}>{n.title ?? 'Notification'}</Text>
          {!n.is_read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.brand }} /> : null}
        </View>
        {n.message ? <Text variant="bodySmall" color="secondary">{n.message}</Text> : null}
        <Text variant="caption" color="muted" style={{ marginTop: 2 }}>{formatWhen(n.created_at)}</Text>
      </View>
    </Pressable>
  );
}

export default function Notifications() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } = useNotifications();

  async function onPressRow(n: Notification) {
    if (n.is_read) return;
    await markRead(n.id);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        right={
          unreadCount > 0 ? (
            <Pressable onPress={markAllRead} hitSlop={8} style={{ paddingHorizontal: 8 }}>
              <Text variant="label" color="brand" style={{ fontSize: 13 }}>Mark all read</Text>
            </Pressable>
          ) : undefined
        }
      />

      {loading && notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : error && notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>Couldn't load notifications. {error.message}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 10 }}>
          <BellOff size={40} color={semantic.textMuted} />
          <Text variant="h3" style={{ fontSize: 16 }}>No notifications yet</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            You'll see updates here — like identity verification results — as they happen.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {notifications.map((n) => (
            <Row key={n.id} n={n} onPress={() => onPressRow(n)} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
