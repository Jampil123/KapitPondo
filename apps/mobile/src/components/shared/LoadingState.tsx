/**
 * components/shared/LoadingState.tsx
 * ----------------------------------------------------------------------------
 * The app's branded loading state: a rotating ring around the peso LogoMark.
 * Reuses the ring motif from app/(app)/pending.tsx so "processing" moments
 * across the app share one identity instead of a bare ActivityIndicator.
 */
import { useEffect, useRef } from 'react';
import { Platform, View, Animated, Easing } from 'react-native';
import { Text } from '@/components/ui/Text';
import { LogoMark } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

function Ring({ size }: { size: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER }),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: semantic.borderStrong }} />
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: 'transparent',
          borderTopColor: semantic.brand,
          borderRightColor: semantic.brand,
          transform: [{ rotate }],
        }}
      />
      <LogoMark size={size * 0.58} />
    </View>
  );
}

/** Branded loading indicator. `fullscreen` centers it in the whole screen with the app background; set false to drop it inline (e.g. inside a card). */
export function LoadingState({ label, fullscreen = true }: { label?: string; fullscreen?: boolean }) {
  return (
    <View
      style={{
        flex: fullscreen ? 1 : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        paddingVertical: fullscreen ? 0 : 32,
        backgroundColor: fullscreen ? semantic.background : 'transparent',
      }}
    >
      <Ring size={72} />
      {label ? <Text variant="label" color="secondary">{label}</Text> : null}
    </View>
  );
}
