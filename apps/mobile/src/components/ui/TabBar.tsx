/**
 * components/ui/TabBar.tsx
 * ----------------------------------------------------------------------------
 * Underline section tabs (the designer's TabBar): horizontal tabs with an
 * accent underline on the active one and an optional count pill. Use for
 * in-screen sections like Pending / Approved / Rejected.
 *
 * (This is the underline style; Segmented is the filled-pill style — keep both,
 * they read differently.)
 */
import { View, Pressable } from 'react-native';
import { Text } from './Text';
import { semantic } from '../../theme/colors';

export type TabOption<T extends string> = { key: T; label: string; count?: number };

export function TabBar<T extends string>({
  options,
  value,
  onChange,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderColor: semantic.border, paddingHorizontal: 2 }}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2.5, borderColor: active ? semantic.brand : 'transparent', marginBottom: -1 }}
          >
            <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', color: active ? semantic.brandDark : semantic.textMuted }}>
              {opt.label}
            </Text>
            {opt.count != null ? (
              <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: active ? semantic.surfaceAlt : semantic.borderStrong }}>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: active ? semantic.brandDark : semantic.textMuted }}>{opt.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
