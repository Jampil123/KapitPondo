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
import { View, Pressable, Keyboard } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Bell, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { toast } from '../ui/Toast';
import { Text } from '../ui/Text';
import { LogoMark } from './ScreenHeader';
import { semantic } from '../../theme/colors';
import { onBandText } from './DashboardBand';
import { useNotifications } from '../../context/NotificationsContext';
import type { Group } from '../../api/groups';
import type { Member } from '../../api/members';

// Some Android keyboards (Gboard, Samsung) react to a clipboard write by
// raising the keyboard with a clipboard suggestion. Nothing on the dashboard
// takes text input, so dismiss it right after copying (and once more after
// the system's clipboard UI has had a moment to appear).
async function copyCode(code: string) {
  Keyboard.dismiss();
  await Clipboard.setStringAsync(code);
  Keyboard.dismiss();
  setTimeout(() => Keyboard.dismiss(), 250);
  toast('Group code copied');
}

function firstName(n?: string | null) {
  return n?.trim().split(/\s+/)[0] ?? 'there';
}

export function DashboardHeader({
  group,
  member,
  roleLabel,
  showCode = false,
}: {
  group: Group | null;
  member: Member | null;
  roleLabel: string;
  /** Show the group's join code beside its name (tap to copy). Organizer only. */
  showCode?: boolean;
}) {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { notifications } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.is_read && (n.group_id === null || n.group_id === groupId)).length;
  const hasUnread = unreadCount > 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingBottom: 4 }}>
      <LogoMark size={40} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="h3" style={{ fontSize: 15 }} numberOfLines={1}>Kumusta, {firstName(member?.full_name)}!</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="caption" style={{ flexShrink: 1, fontSize: 11, lineHeight: 14, color: onBandText }} numberOfLines={1}>{group?.name ?? 'Group'}</Text>
          {showCode && group?.fund_code ? (
            <Pressable
              onPress={() => copyCode(group.fund_code)}
              hitSlop={8}
              accessibilityLabel={`Group code ${group.fund_code}, tap to copy`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}
            >
              <Text style={{ fontSize: 10.5, lineHeight: 13, fontFamily: 'Poppins_700Bold', letterSpacing: 1, color: semantic.textPrimary }}>{group.fund_code}</Text>
              <Copy size={10} color={semantic.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Pressable onPress={() => router.push({ pathname: '/(app)/notifications' as any, params: { groupId } })} hitSlop={8} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}>
        <Bell size={22} color={semantic.textPrimary} />
        {hasUnread ? (
          <View
            style={{
              position: 'absolute', top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8,
              paddingHorizontal: 3, backgroundColor: '#E5484D', borderWidth: 1.5, borderColor: '#CFE0E8',
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
