import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic } from '@/theme/colors';

/** Scrollable pill filters — Group Ledger, Member balances, Members & officers. */
export function FilterChips<T extends string>({
  options, value, onChange, style,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
  style?: object;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0 }, style]} contentContainerStyle={{ gap: 7 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 18, backgroundColor: active ? semantic.dashCard : semantic.surface, borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border }}
          >
            <Text style={{ fontSize: 11.5, fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium', color: active ? '#fff' : semantic.textSecondary }}>{o.label}</Text>
            {o.count ? (
              <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : semantic.surfaceAlt, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: active ? '#fff' : semantic.textSecondary }}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
