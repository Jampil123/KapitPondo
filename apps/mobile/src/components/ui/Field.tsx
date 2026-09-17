/**
 * components/ui/Field.tsx
 * ----------------------------------------------------------------------------
 * The prototype's input field: muted label above, soft-bg input row with an
 * optional leading icon / prefix and optional trailing node, rounded 12.
 * PasswordField adds the eye toggle.
 *
 * Icons are passed in as `leading` (a node) so this stays decoupled from any
 * icon library. Screens use lucide-react-native (Phone, Lock, User, Mail…).
 */
import { useState } from 'react';
import { View, TextInput, Pressable, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Text } from './Text';
import { semantic, intent } from '../../theme/colors';
import { typography } from '../../theme/typography';

type FieldProps = TextInputProps & {
  label: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  prefix?: string;
  error?: string;
};

export function Field({ label, leading, trailing, prefix, error, style, ...rest }: FieldProps) {
  return (
    <View style={{ gap: 7, marginBottom: 15 }}>
      <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500' }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: semantic.surfaceAlt,
          borderRadius: 12,
          paddingVertical: 13,
          paddingHorizontal: 14,
          borderWidth: error ? 1.5 : 0,
          borderColor: error ? intent.danger.base : undefined,
        }}
      >
        {leading}
        {prefix ? (
          <Text variant="body" color="secondary" style={{ fontWeight: '600' }}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          placeholderTextColor={semantic.textMuted}
          style={[
            { flex: 1, minWidth: 0, padding: 0, color: semantic.textPrimary },
            typography.body,
            style,
          ]}
          {...rest}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" style={{ color: intent.danger.text }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

type PasswordFieldProps = Omit<FieldProps, 'secureTextEntry' | 'trailing'>;

export function PasswordField(props: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      secureTextEntry={!shown}
      trailing={
        <Pressable onPress={() => setShown((s) => !s)} hitSlop={8}>
          {shown ? (
            <Eye size={19} color={semantic.textSecondary} />
          ) : (
            <EyeOff size={19} color={semantic.textSecondary} />
          )}
        </Pressable>
      }
    />
  );
}
