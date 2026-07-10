/**
 * components/ui/Segmented.tsx
 * ----------------------------------------------------------------------------
 * Pill segmented control / tab bar (the designer's TabBar + SegmentedControl,
 * unified). Active segment = brand fill (matches the dashboard's teal accent
 * throughout — hero cards, tile icons, the nav's "+" button); optional count badge.
 */
import { View, Pressable } from 'react-native';
import { Text } from './Text';
import { semantic } from '../../theme/colors';

export type SegOption<T extends string> = { key: T; label: string; count?: number };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9, backgroundColor: active ? semantic.brand : 'transparent' }}
          >
            <Text variant="label" style={{ fontSize: 13, color: active ? '#fff' : semantic.textSecondary }}>{o.label}</Text>
            {o.count ? (
              <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: active ? 'rgba(255,255,255,0.25)' : semantic.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="caption" style={{ fontSize: 10, color: active ? '#fff' : semantic.textPrimary, fontWeight: '700' }}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
