import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { intent } from '@/theme/colors';

/** "● All checks passed" / "● 1 check failed" — `short` gives "All passed" / "1 failed". */
export function ChecksPill({ failed, short = false }: { failed: number; short?: boolean }) {
  const tone = failed ? intent.danger : intent.success;
  const label = failed
    ? `${failed} ${short ? '' : `check${failed === 1 ? '' : 's'} `}failed`
    : short ? 'All passed' : 'All checks passed';
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: tone.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.text }} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: tone.text }}>{label}</Text>
    </View>
  );
}
