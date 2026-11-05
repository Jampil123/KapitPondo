import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Crown, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { intent } from '@/theme/colors';
import { useQuery } from '@/hooks/useApi';
import { getHandover } from '@/api/groups';

/** A pending Organizer hand-over (UC-GM-10): asks the chosen member to review it, reminds the Organizer it's waiting. */
export function HandoverBanner({ groupId, memberId }: { groupId: string; memberId: string | null | undefined }) {
  const router = useRouter();
  const { data: h } = useQuery(() => getHandover(groupId), [groupId]);
  if (!h) return null;

  const forMe = h.to_member_id === memberId;
  const from = h.by_sysadmin ? 'The system administrator' : h.from?.full_name ?? 'The Organizer';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(app)/[groupId]/handover' as any, params: { groupId } })}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: intent.info.soft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 }}
    >
      <Crown size={18} color={intent.info.text} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ color: intent.info.text }}>
          {forMe ? `${from} wants you to be the Organizer` : `Waiting for ${h.to?.full_name ?? 'the member'} to accept`}
        </Text>
        <Text variant="caption" style={{ color: intent.info.text }}>{forMe ? 'Review the request' : 'Organizer hand-over · you can still cancel it'}</Text>
      </View>
      <ChevronRight size={16} color={intent.info.text} />
    </Pressable>
  );
}
