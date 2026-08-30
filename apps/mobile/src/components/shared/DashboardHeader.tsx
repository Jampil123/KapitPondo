/**
 * components/shared/DashboardHeader.tsx
 * ----------------------------------------------------------------------------
 * Reusable greeting header for ALL role dashboards: brand logo + "Kumusta,
 * {name}!" with the group's name underneath, plus a bell (unread count
 * badge). Bell -> Notification Center, scoped to THIS group — the badge only
 * counts notifications whose group_id matches this group (plus account-level
 * ones with a null group_id, e.g. identity verification results, which apply
 * everywhere). Previously this showed the unread count across every group the
 * member belongs to, so Group A's badge included Group B's unread items.
 * Which role the caller is viewing as is shown by the RoleSwitch pill in
 * [groupId]/index.tsx instead of repeated here.
 *
 *   <DashboardHeader group={group} member={member} roleLabel="Organizer" />
 */
import { View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
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
  group,
  member,
  roleLabel,
}: {
  group: Group | null;
  member: Member | null;
  roleLabel: string;
}) {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { notifications } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.is_read && (n.group_id === null || n.group_id === groupId)).length;
  const hasUnread = unreadCount > 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, backgroundColor: semantic.background }}>
      <LogoMark size={40} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>Kumusta, {firstName(member?.full_name)}!</Text>
        <Text variant="caption" color="secondary" style={{ fontSize: 11, lineHeight: 14 }} numberOfLines={1}>{group?.name ?? 'Group'}</Text>
      </View>

      <Pressable onPress={() => router.push({ pathname: '/(app)/notifications' as any, params: { groupId } })} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
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
