/**
 * components/ui/PillTabs.tsx
 * ----------------------------------------------------------------------------
 * Oblong, horizontally-scrollable tab pills — active tab filled dark, count
 * badges (an optional "hot" red variant for something needing attention).
 * Used by the Treasurer's Contributions and Repayments hubs.
 */
import { View, Pressable, ScrollView } from 'react-native';
import { Text } from './Text';
import { semantic, intent } from '../../theme/colors';

export function PillTabs<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string; count?: number; hot?: boolean }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 2 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingVertical: 9, paddingHorizontal: 15, borderRadius: 20,
              backgroundColor: active ? semantic.dashCard : semantic.surface,
              borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border,
            }}
          >
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{o.label}</Text>
            {o.count != null ? (
              <View style={{
                minWidth: 18, paddingHorizontal: 5, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? 'rgba(255,255,255,0.22)' : o.hot ? intent.danger.soft : intent.info.soft,
              }}>
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : o.hot ? intent.danger.text : intent.info.text }}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
