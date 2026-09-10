/**
 * components/shared/PickerSheet.tsx
 * ----------------------------------------------------------------------------
 * A bottom-sheet list picker: title + close, options with a checkmark on the
 * selected one. Used wherever a screen needs a simple single-select sheet
 * (identity.tsx's province/city/barangay/sex pickers, identity-capture.tsx's
 * ID type picker, ...).
 */
import { View, Pressable, Modal } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic } from '../../theme/colors';

export type PickerOption = { label: string; value: string };

export function PickerSheet({
  visible, title, options, selected, onSelect, onClose, insets,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  insets: { bottom: number };
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="h3" style={{ flex: 1, fontSize: 17 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
          </View>
          <View>
            {options.map((t, i) => (
              <Pressable
                key={t.value}
                onPress={() => onSelect(t.value)}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 14,
                  borderBottomWidth: i < options.length - 1 ? 1 : 0,
                  borderBottomColor: semantic.border,
                }}
              >
                <Text variant="label" style={{ flex: 1, color: selected === t.value ? semantic.brandDark : semantic.textPrimary }}>
                  {t.label}
                </Text>
                {selected === t.value ? <Check size={18} color={semantic.brandDark} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
