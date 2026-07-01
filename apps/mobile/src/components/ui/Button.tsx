/**
 * components/ui/Button.tsx
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, ActivityIndicator, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { semantic, intent, shadowToken } from '../../theme/colors';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  leading,
  style,
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const isGhost = variant === 'ghost';
  const off = disabled || loading;

  // Always render the primary colour; disabled = reduced opacity so it still
  // reads as a button rather than blending into the page background.
  const bg = isGhost ? 'transparent' : intent.primary.base;
  const fg = isGhost ? semantic.brandDark : '#FFFFFF';

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        {
          backgroundColor: bg,
          borderRadius: 13,
          paddingVertical: 15,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          ...(isGhost && { borderWidth: 1.5, borderColor: semantic.borderStrong }),
          opacity: off ? 0.45 : pressed ? 0.88 : 1,
        },
        !isGhost && !off ? shadowToken.button : undefined,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {leading ? <View>{leading}</View> : null}
          <Text variant="label" style={{ color: fg, fontSize: 15.5 }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
