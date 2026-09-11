import { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, KeyboardAvoidingView, Platform, Animated, Easing, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { semantic } from '@/theme/colors';

// A percentage maxHeight ('85%') only resolves against a parent with its own
// DEFINITE height — the wrapping Animated.View here has none (it just hugs
// its child for the translateY transform), so that percentage silently fails
// to constrain anything, and the sheet sizes to raw content instead. Using a
// concrete pixel value (screen height, not the window's, so it's stable
// across Android's on-screen nav bar) sidesteps that Yoga quirk entirely.
const MAX_SHEET_HEIGHT = Dimensions.get('screen').height * 0.85;

/**
 * Bottom sheet with a real slide-up/slide-down transition, replacing
 * Modal's built-in `animationType="slide"` — that animates the WHOLE
 * transparent overlay (dim included) as one rigid block and gives no exit
 * animation at all (content just vanishes the instant `value` goes null).
 * Here the backdrop fades independently while the sheet translates, and the
 * last non-null `value` stays rendered through the close animation instead
 * of blanking out mid-slide.
 */
export function SlideSheet<T>({
  value, onClose, keyboardAvoiding, children,
}: {
  value: T | null;
  onClose: () => void;
  keyboardAvoiding?: boolean;
  children: (value: T) => React.ReactNode;
}) {
  const visible = value !== null;
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [rendered, setRendered] = useState<T | null>(value);
  const translateY = useRef(new Animated.Value(visible ? 0 : 500)).current;
  const backdrop = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (value !== null) setRendered(value);
  }, [value]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 500, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted || rendered === null) return null;

  const sheet = (
    <Animated.View style={{ transform: [{ translateY }], maxHeight: MAX_SHEET_HEIGHT }}>
      <Pressable
        style={{
          backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 20, paddingBottom: 20 + insets.bottom, gap: 14, maxHeight: MAX_SHEET_HEIGHT, overflow: 'hidden',
        }}
      >
        <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: semantic.border, alignSelf: 'center', marginTop: -6, marginBottom: -8 }} />
        {children(rendered)}
      </Pressable>
    </Animated.View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1 }}>
        <Animated.View style={{ flex: 1, backgroundColor: 'rgba(42,62,75,0.35)', justifyContent: 'flex-end', opacity: backdrop }}>
          {keyboardAvoiding ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>{sheet}</KeyboardAvoidingView>
          ) : sheet}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
