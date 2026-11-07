import { useEffect, useRef, useState } from 'react';
import { View, Pressable, Modal, useWindowDimensions, Animated as RNAnimated, Easing } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { Pointer, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';

/** A target's position in window coordinates (from measureInWindow). */
export type TargetRect = { x: number; y: number; width: number; height: number };

type Props = {
  visible: boolean;
  target: TargetRect | null;
  /** Corner radius of the spotlight hole. */
  radius?: number;
  step: number;
  total: number;
  title: string;
  body?: string;
  /**
   * Tapping the spotlighted area. Use it when the step is "tap this" — the
   * tap performs the real action. Omit for info-only steps (use `nextLabel`).
   */
  onTargetPress?: () => void;
  /** Shows a button in the card (e.g. "Next", "Got it"). */
  nextLabel?: string;
  onNext?: () => void;
  onSkip: () => void;
};

const PAD = 6;
const GAP = 16;     // space between hole and card (the caret sits in it)
const SIDE = 20;    // card's left/right inset
const CARET = 9;

/**
 * Full-screen dim overlay with a spotlight hole over `target`, a pulsing ring
 * on it, and a card with a caret pointing at it. Rendered in a Modal so it
 * sits above scroll views and headers. Everything outside the hole is blocked
 * except the card. If the target is off-screen, the card is centered and its
 * button performs the target's action.
 */
export function CoachMark({ visible, target, radius = 12, step, total, title, body, onTargetPress, nextLabel, onNext, onSkip }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  // Convert window-space target into overlay-local coordinates (the modal may
  // not start at window y=0 depending on status-bar handling).
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const raw =
    target && origin
      ? { x: target.x - origin.x - PAD, y: target.y - origin.y - PAD, w: target.width + PAD * 2, h: target.height + PAD * 2 }
      : null;
  const onScreen = !!raw && raw.w > PAD * 2 && raw.y >= 0 && raw.y + raw.h <= H;
  const hole = onScreen ? raw : null;
  const ready = !!origin && !!target;
  const r = radius + PAD;

  // Off-screen target: the card's button stands in for tapping it.
  const buttonLabel = nextLabel ?? (!hole && onTargetPress ? 'Continue' : undefined);
  const buttonAction = onNext ?? (!hole ? onTargetPress : undefined);
  const tapStep = !!hole && !!onTargetPress && !buttonLabel;

  const above = hole ? hole.y > H / 2 : false;
  const cardPos = hole
    ? above ? { bottom: H - hole.y + GAP } : { top: hole.y + hole.h + GAP }
    : { top: H / 2 - 90 };
  const caretLeft = hole
    ? Math.min(Math.max(hole.x + hole.w / 2 - SIDE - CARET, 18), W - SIDE * 2 - 18 - CARET * 2)
    : 0;

  // Pulsing ring around the hole — "tap here".
  const pulse = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (!hole) return;
    pulse.setValue(0);
    const loop = RNAnimated.loop(
      RNAnimated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [hole?.x, hole?.y, hole?.w, hole?.h]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onSkip}>
      <Animated.View
        entering={FadeIn.duration(200)}
        ref={rootRef as any}
        collapsable={false}
        onLayout={() => rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
        style={{ flex: 1 }}
      >
        <Svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
          <Defs>
            <Mask id="coach-hole" x="0" y="0" width={W} height={H}>
              <Rect x="0" y="0" width={W} height={H} fill="#fff" />
              {hole ? <Rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={r} fill="#000" /> : null}
            </Mask>
          </Defs>
          <Rect x="0" y="0" width={W} height={H} fill="rgba(16,28,36,0.78)" mask="url(#coach-hole)" />
          {hole ? (
            <Rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={r} fill="none" stroke="#fff" strokeWidth={2} />
          ) : null}
        </Svg>

        {hole ? (
          <RNAnimated.View
            pointerEvents="none"
            style={{
              position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: r,
              borderWidth: 2, borderColor: '#fff',
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
            }}
          />
        ) : null}

        {hole && onTargetPress ? (
          <Pressable
            onPress={onTargetPress}
            accessibilityRole="button"
            accessibilityLabel={title}
            style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: r }}
          />
        ) : null}

        {ready ? (
          <Animated.View
            key={`${step}-${title}`}
            entering={(above ? FadeInUp : FadeInDown).duration(260)}
            style={[{ position: 'absolute', left: SIDE, right: SIDE }, cardPos]}
          >
            {hole && !above ? <Caret left={caretLeft} up /> : null}
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, paddingTop: 14 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Dots step={step} total={total} />
                <Pressable onPress={onSkip} hitSlop={12} accessibilityLabel="Skip tutorial" style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: semantic.textMuted }}>Skip</Text>
                  <X size={13} color={semantic.textMuted} />
                </Pressable>
              </View>

              <Text style={{ fontSize: 16, lineHeight: 22, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{title}</Text>
              {body ? (
                <Text style={{ fontSize: 13, lineHeight: 19, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary, marginTop: 4 }}>{body}</Text>
              ) : null}

              {tapStep ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start', backgroundColor: semantic.surfaceAlt, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10 }}>
                  <Pointer size={13} color={semantic.brandDark} />
                  <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>Tap the highlight</Text>
                </View>
              ) : null}

              {buttonLabel && buttonAction ? (
                <Pressable
                  onPress={buttonAction}
                  style={({ pressed }) => ({
                    marginTop: 14, alignSelf: 'flex-end', backgroundColor: semantic.brandDark,
                    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22, opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>{buttonLabel}</Text>
                </Pressable>
              ) : null}
            </View>
            {hole && above ? <Caret left={caretLeft} /> : null}
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

/** Step progress: the current step is a wider pill, done steps filled, upcoming faint. */
function Dots({ step, total }: { step: number; total: number }) {
  if (total <= 1) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        return (
          <View
            key={n}
            style={{
              height: 6, borderRadius: 3, width: n === step ? 18 : 6,
              backgroundColor: n <= step ? semantic.brandDark : semantic.borderStrong,
            }}
          />
        );
      })}
    </View>
  );
}

/** Small triangle joining the card to the highlighted target. */
function Caret({ left, up = false }: { left: number; up?: boolean }) {
  return (
    <View
      style={{
        marginLeft: left, width: 0, height: 0,
        borderLeftWidth: CARET, borderRightWidth: CARET,
        borderLeftColor: 'transparent', borderRightColor: 'transparent',
        ...(up
          ? { borderBottomWidth: CARET, borderBottomColor: semantic.surface }
          : { borderTopWidth: CARET, borderTopColor: semantic.surface }),
      }}
    />
  );
}
