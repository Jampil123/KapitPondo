/**
 * components/shared/DashboardHeader.tsx
 * ----------------------------------------------------------------------------
 * Reusable greeting header for ALL role dashboards: brand logo + "Kumusta,
 * {name}" with a small inline role pill, plus a bell (unread count badge).
 * Bell -> Notification Center, badge reflects NotificationsContext's live
 * (realtime-updated) unread count (capped "9+"/"99+" past two/three digits).
 *
 * The role pill is a prop so each dashboard shows the right label
 * (Organizer / Treasurer / Auditor / Member) using one component.
 *
 *   <DashboardHeader group={group} member={member} roleLabel="Organizer" />
 */
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { LogoMark } from './ScreenHeader';
import { semantic } from '../../theme/colors';
import { useNotifications } from '../../context/NotificationsContext';
import type { Group } from '../../api/groups';
import type { Member } from '../../api/members';

function firstName(n?: string | null) {
  return n?.trim().split(/\s+/)[0] ?? 'there';
}

export function DashboardHeader({
  member,
  roleLabel,
}: {
  group: Group | null;
  member: Member | null;
  roleLabel: string;
}) {
  const { unreadCount } = useNotifications();
  const hasUnread = unreadCount > 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, backgroundColor: semantic.background }}>
      <LogoMark size={40} />

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="h3" style={{ fontSize: 17 }} numberOfLines={1}>Kumusta, {firstName(member?.full_name)}</Text>
        <View style={{ backgroundColor: semantic.surfaceAlt, borderWidth: 1, borderColor: semantic.brand, paddingHorizontal: 5, paddingVertical: 0.5, borderRadius: 999 }}>
          <Text style={{ fontSize: 8.5, fontFamily: 'Poppins_500Medium', color: semantic.brandDark }}>{roleLabel}</Text>
        </View>
      </View>

      <Pressable onPress={() => router.push('/(app)/notifications' as any)} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Bell size={22} color={semantic.textPrimary} />
        {hasUnread ? (
          <View
            style={{
              position: 'absolute', top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8,
              paddingHorizontal: 3, backgroundColor: '#E5484D', borderWidth: 1.5, borderColor: semantic.background,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#fff', lineHeight: 12 }}>
              {unreadCount > 99 ? '99+' : unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
