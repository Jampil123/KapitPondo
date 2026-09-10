/**
 * components/ui/AddressPickerSheet.tsx
 * ----------------------------------------------------------------------------
 * A bottom-sheet picker like the wizard's plain PickerSheet, but with a
 * search box on top and options computed live from a query instead of a
 * fixed list — for province/city/barangay pickers backed by
 * constants/phAddress.ts, where the option list is too large (or depends on
 * a parent selection) to just render in full.
 */
import { useState } from 'react';
import { View, Modal, Pressable, TextInput, FlatList } from 'react-native';
import { Check, X, Search } from 'lucide-react-native';
import { Text } from './Text';
import { semantic } from '../../theme/colors';

export type AddressOption = { label: string; value: string };

export function AddressPickerSheet({
  visible, title, placeholder = 'Search…', getOptions, selected, onSelect, onClose, insets,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  getOptions: (query: string) => AddressOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  insets: { bottom: number };
}) {
  const [query, setQuery] = useState('');
  const options = visible ? getOptions(query) : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setQuery('')}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16, maxHeight: '78%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="h3" style={{ flex: 1, fontSize: 17 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 }}>
            <Search size={16} color={semantic.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={semantic.textMuted}
              style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: semantic.textPrimary }}
              autoFocus
            />
          </View>

          <FlatList
            data={options}
            keyExtractor={(t) => t.value}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 340 }}
            ListEmptyComponent={
              <Text variant="bodySmall" color="secondary" style={{ paddingVertical: 18, textAlign: 'center' }}>
                No matches
              </Text>
            }
            renderItem={({ item: t, index }) => (
              <Pressable
                onPress={() => onSelect(t.value)}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 14,
                  borderBottomWidth: index < options.length - 1 ? 1 : 0,
                  borderBottomColor: semantic.border,
                }}
              >
                <Text variant="label" style={{ flex: 1, color: selected === t.value ? semantic.brandDark : semantic.textPrimary }}>
                  {t.label}
                </Text>
                {selected === t.value ? <Check size={18} color={semantic.brandDark} /> : null}
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
