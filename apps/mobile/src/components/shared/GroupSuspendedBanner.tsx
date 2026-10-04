/**
 * components/shared/GroupSuspendedBanner.tsx — shown on a fund group the
 * System Administrator suspended (migration 0065). While suspended the API
 * refuses every change in the group, so this tells members why up front
 * instead of letting each action fail on its own.
 */
import { View } from 'react-native';
import { Ban } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { intent } from '@/theme/colors';
import type { Group } from '@/api/groups';

export function GroupSuspendedBanner({ group }: { group: Group }) {
  if (!group.suspended_at) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        backgroundColor: intent.danger.soft,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 14,
      }}
    >
      <Ban size={18} color={intent.danger.strong} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ color: intent.danger.strong }}>This group is suspended</Text>
        {group.suspension_reason ? (
          <Text variant="caption" style={{ color: intent.danger.strong }}>{group.suspension_reason}</Text>
        ) : null}
        <Text variant="caption" color="secondary">You can view records, but no changes can be made until it&apos;s reinstated.</Text>
      </View>
    </View>
  );
}
