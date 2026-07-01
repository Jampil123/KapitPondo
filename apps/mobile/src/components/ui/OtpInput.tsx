/**
 * components/ui/OtpInput.tsx
 * ----------------------------------------------------------------------------
 * The prototype's 6-box code input: one hidden TextInput drives six visual
 * cells. Active cell gets an accent ring; filled cells get a darker border.
 */
import { useRef } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Text } from './Text';
import { semantic, shadowToken } from '../../theme/colors';

type OtpInputProps = {
  value: string;
  onChange: (v: string) => void;
  length?: number;
};

export function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  const ref = useRef<TextInput>(null);
  const cells = Array.from({ length });

  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ position: 'relative' }}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
      <View style={{ flexDirection: 'row', gap: 9, justifyContent: 'center' }}>
        {cells.map((_, i) => {
          const active = i === value.length;
          const filled = i < value.length;
          return (
            <View
              key={i}
              style={[
                {
                  width: 46,
                  height: 56,
                  borderRadius: 13,
                  backgroundColor: semantic.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.8,
                  borderColor: active
                    ? semantic.brand
                    : filled
                      ? semantic.brandDark
                      : semantic.border,
                },
                shadowToken.card,
              ]}
            >
              <Text variant="h2" style={{ fontSize: 22, fontWeight: '700' }}>
                {value[i] ?? ''}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}
