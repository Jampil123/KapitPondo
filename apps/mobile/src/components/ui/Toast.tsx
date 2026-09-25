/**
 * components/ui/Toast.tsx
 * ----------------------------------------------------------------------------
 * Short success confirmation at the bottom of the screen — a dark pill with a
 * check and one line ("Contribution confirmed"), gone after a few seconds.
 * For outcomes that need no decision; errors stay as Alert dialogs.
 *
 *   toast('Contribution confirmed');
 *
 * <ToastHost /> is mounted once in app/_layout.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Text } from './Text';
import { NAV_BG } from '../shared/GroupSheetNav';

const SHOW_MS = 2600;
// Clears the floating bottom nav (66 tall + its margin) so the toast sits just above it.
const ABOVE_NAV = 92;

type Listener = (message: string) => void;
let listener: Listener | null = null;

/** Show a one-line success toast. */
export function toast(message: string) {
  listener?.(message);
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (next) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMessage(null));
      }, SHOW_MS);
    };
    return () => {
      listener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [opacity]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 14) + ABOVE_NAV,
        opacity,
        transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: NAV_BG, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16,
          shadowColor: NAV_BG, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 8,
        }}
      >
        <Check size={16} color="#fff" strokeWidth={2.6} />
        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium', color: '#fff' }}>{message}</Text>
      </View>
    </Animated.View>
  );
}
