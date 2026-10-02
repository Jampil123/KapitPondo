import { View } from 'react-native';
import { CheckCheck, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic } from '@/theme/colors';

/** The "Seen" / "Sent" line under the newest message. */
export function SeenReceipt({ label, seen, alignRight }: { label: string; seen: boolean; alignRight: boolean }) {
  const color = seen ? semantic.brand : semantic.textMuted;
  const Icon = seen ? CheckCheck : Check;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: alignRight ? 'flex-end' : 'flex-start', paddingHorizontal: 6, marginTop: 2 }}>
      <Icon size={13} color={color} strokeWidth={2.2} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color }}>{label}</Text>
    </View>
  );
}
