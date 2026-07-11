/**
 * components/shared/GroupCard.tsx — a row card for the "My Groups" list.
 * Adds the organizer's identity (initials avatar + name) to what the old row
 * showed (name, fund code, role/status badge) — see api/groups.ts's `owner`
 * field, joined server-side in listMyGroups so this needs no per-card fetch.
 * Group name is its own top row (full width) rather than sharing a flex row
 * with the icon block, so it isn't vertically centered against the avatar.
 */
import { View, Pressable } from 'react-native';
import { Users } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Avatar } from '@/components/ui/Avatar';
import { semantic, shadowToken } from '@/theme/colors';
import type { MyGroup } from '@/api/groups';

export function GroupCard({ item, onPress }: { item: MyGroup; onPress: () => void }) {
  const ownerName = item.groups.owner?.full_name ?? null;

  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          backgroundColor: semantic.background,
          borderWidth: 1,
          borderColor: semantic.borderStrong,
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 18,
          gap: 12,
        },
        shadowToken.card,
      ]}
    >
      <Text variant="label" style={{ fontSize: 16 }} numberOfLines={1}>{item.groups.name}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Users size={26} color="#fff" />
        </View>

        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="caption" color="secondary" style={{ letterSpacing: 1 }} numberOfLines={1}>
              {item.groups.fund_code}
            </Text>
            {item.status === 'pending' ? (
              <StatusBadge entity="membership" value="pending" />
            ) : (
              <StatusBadge entity="role" value={item.role} />
            )}
          </View>

          <View>
            <Text variant="caption" color="secondary">Organized by</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Avatar name={ownerName} size={18} />
              <Text variant="label" style={{ fontSize: 13, flex: 1 }} numberOfLines={1}>
                {ownerName ?? 'Unknown'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
