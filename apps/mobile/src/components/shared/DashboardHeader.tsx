/**
 * components/shared/DashboardHeader.tsx
 * ----------------------------------------------------------------------------
 * Reusable greeting header for ALL role dashboards: rounded-square avatar +
 * "Kumusta, {name}" + group name + a neutral role pill, with grid + bell (unread
 * dot) icons. Grid -> back to the groups list; bell -> notifications placeholder.
 *
 * The role pill is a prop so each dashboard shows the right label
 * (Organizer / Treasurer / Auditor / Member) using one component.
 *
 *   <DashboardHeader group={group} member={member} roleLabel="Organizer" />
 */
import { View, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { LayoutGrid, Bell } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { semantic } from '../../theme/colors';
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, backgroundColor: semantic.background }}>
      <Avatar name={member?.full_name} uri={member?.avatar_url} size={46} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="h3" style={{ fontSize: 17 }}>Kumusta, {firstName(member?.full_name)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{group?.name ?? 'Group'}</Text>
          <View style={{ backgroundColor: semantic.surfaceAlt, borderWidth: 1, borderColor: semantic.brand, paddingHorizontal: 10, paddingVertical: 2.5, borderRadius: 999 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: semantic.brandDark }}>{roleLabel}</Text>
          </View>
        </View>
      </View>

      <Pressable onPress={() => router.replace('/(app)/groups')} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <LayoutGrid size={22} color={semantic.textPrimary} />
      </Pressable>

      <Pressable onPress={() => Alert.alert('Notifications', 'Coming soon.')} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Bell size={22} color={semantic.textPrimary} />
        <View style={{ position: 'absolute', top: 7, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: '#E5484D', borderWidth: 1.5, borderColor: semantic.background }} />
      </Pressable>
    </View>
  );
}
