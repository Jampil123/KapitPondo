import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic } from '@/theme/colors';

/** Equal-width underline filter tabs — the member pages' filter bar (Contributions, Reports, Activity). */
export function FilterTabs<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={{ flex: 1, alignItems: 'center', paddingBottom: 11, gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontSize: 13, fontFamily: active ? 'Poppins_700Bold' : 'Poppins_600SemiBold', color: active ? semantic.brandDark : semantic.textSecondary }}
              >
                {o.label}
              </Text>
              {o.count ? (
                <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? semantic.brandDark : semantic.surfaceAlt }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{o.count}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ height: 3, width: '60%', borderRadius: 2, backgroundColor: active ? semantic.brandDark : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}
