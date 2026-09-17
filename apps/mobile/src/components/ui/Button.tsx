/**
 * components/ui/Button.tsx
 */
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Pressable, ActivityIndicator, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { semantic, intent, shadowToken } from '../../theme/colors';

// A double tap (two presses before the first one's navigation/async work has
// visibly finished) is how "the page doubles" bugs happen app-wide — a
// second router.push/replace fires while the first is still mid-transition.
// Ignoring any press within this window of the last accepted one is a single
// fix point for nearly every button in the app, rather than guarding each
// screen's onPress individually.
const DOUBLE_TAP_GUARD_MS = 700;

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  style?: ViewStyle;
  bordered?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  leading,
  style,
  bordered = true,
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const lastPressAt = useRef(0);
  const isGhost = variant === 'ghost';
  const off = disabled || loading;

  // Always render the primary colour; disabled = reduced opacity so it still
  // reads as a button rather than blending into the page background.
  const bg = isGhost ? 'transparent' : intent.primary.base;
  const fg = isGhost ? semantic.brandDark : '#FFFFFF';

  function handlePress() {
    const now = Date.now();
    if (now - lastPressAt.current < DOUBLE_TAP_GUARD_MS) return;
    lastPressAt.current = now;
    onPress?.();
  }

  return (
    <Pressable
      onPress={off ? undefined : handlePress}
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
          ...(isGhost && bordered && { borderWidth: 1.5, borderColor: semantic.borderStrong }),
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
