/**
 * components/ui/AddressPickerSheet.tsx
 * ----------------------------------------------------------------------------
 * A bottom-sheet picker like the wizard's plain PickerSheet, but backed by an
 * async `getOptions` function instead of a fixed list — for province/city/
 * barangay pickers (api/address.ts, live PSGC data), where the option list
 * depends on a parent selection (city depends on province, barangay depends
 * on both province and city) and now comes over the network rather than a
 * bundled dataset, hence the loading state.
 * No search box — just a scrollable list of whatever getOptions() returns.
 */
import { useEffect, useState } from 'react';
import { View, Modal, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Text } from './Text';
import { semantic } from '../../theme/colors';

export type AddressOption = { label: string; value: string };

export function AddressPickerSheet({
  visible, title, getOptions, selected, onSelect, onClose, insets,
}: {
  visible: boolean;
  title: string;
  getOptions: () => Promise<AddressOption[]>;
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  insets: { bottom: number };
}) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<AddressOption[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getOptions()
      .then((result) => { if (!cancelled) setOptions(result); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16, maxHeight: '78%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="h3" style={{ flex: 1, fontSize: 17 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator color={semantic.brand} />
            </View>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(t) => t.value}
              style={{ maxHeight: 400 }}
              ListEmptyComponent={
                <Text variant="bodySmall" color="secondary" style={{ paddingVertical: 18, textAlign: 'center' }}>
                  {loadError ? "Couldn't load options — check your connection and try again." : 'No options'}
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
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
