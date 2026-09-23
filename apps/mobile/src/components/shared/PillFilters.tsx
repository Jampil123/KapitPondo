import { View, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';

const SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

/** Card-style pill filters that scroll sideways — member Activity and Transactions. Bleeds to the screen edge inside a 16px-padded page. */
export function PillFilters<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string; count?: number; hot?: boolean }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 7, paddingHorizontal: 16, paddingVertical: 4 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 13, borderRadius: 20, backgroundColor: active ? semantic.dashCard : semantic.surface }, SHADOW]}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_500Medium', color: active ? '#fff' : semantic.textSecondary }}>{o.label}</Text>
            {o.count ? (
              <View style={{ minWidth: 16, paddingHorizontal: 4, paddingVertical: 0, borderRadius: 9, alignItems: 'center', backgroundColor: active ? 'rgba(255,255,255,0.25)' : o.hot ? intent.danger.soft : semantic.surfaceAlt }}>
                <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: active ? '#fff' : o.hot ? intent.danger.text : semantic.textSecondary }}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
