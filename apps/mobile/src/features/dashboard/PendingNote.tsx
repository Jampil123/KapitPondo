import { View } from 'react-native';
import { Clock3 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';

/** "incl. ₱X pending verification" — money the treasurer approved counts on the dashboard before it's verified into the ledger. */
export function PendingNote({ amount, color = intent.info.text }: { amount: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
      <Clock3 size={10} color={color} strokeWidth={2.4} />
      <Text style={{ fontSize: 10.5, lineHeight: 13, fontFamily: 'Poppins_600SemiBold', color }} numberOfLines={1}>incl. {formatPeso(amount)} pending verification</Text>
    </View>
  );
}
