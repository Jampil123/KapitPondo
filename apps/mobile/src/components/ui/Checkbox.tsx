/**
 * components/ui/Checkbox.tsx
 * ----------------------------------------------------------------------------
 * Simple checkbox: square box + checkmark, toggled state. Used for the
 * required privacy-policy acknowledgment on the identity wizard's last step.
 *
 *   <Checkbox checked={agreed} onToggle={() => setAgreed(a => !a)} label="I agree to..." />
 */
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from './Text';
import { semantic } from '../../theme/colors';

export function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View
        style={{
          width: 20, height: 20, borderRadius: 5, marginTop: 1,
          backgroundColor: checked ? semantic.brand : 'transparent',
          borderWidth: 1.5, borderColor: checked ? semantic.brand : semantic.borderStrong,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
      </View>
      <Text variant="bodySmall" color="secondary" style={{ flex: 1 }}>{label}</Text>
    </Pressable>
  );
}
