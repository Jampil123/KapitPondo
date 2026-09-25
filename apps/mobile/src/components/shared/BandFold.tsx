import { useState, type ReactNode } from 'react';
import { View, Pressable, Animated, Easing } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { BAND_GAP, BAND_TAB_SIZE } from './DashboardBand';
import { NAV_BG } from './GroupSheetNav';
import { semantic, shadowToken } from '../../theme/colors';

const ANIM_MS = 260;

/** Open state plus the 0→1 progress value that drives BandTab and BandCollapsible. */
export function useBandFold(initial = false) {
  const [open, setOpen] = useState(initial);
  const [progress] = useState(() => new Animated.Value(initial ? 1 : 0));

  function toggle() {
    const next = !open;
    setOpen(next);
    Animated.timing(progress, {
      toValue: next ? 1 : 0,
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  return { open, progress, toggle };
}

/** Compact round arrow straddling the bottom-right edge of the band (pass as DashboardBand's `tab`). */
export function BandTab({ open, progress, onPress, label }: { open: boolean; progress: Animated.Value; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={open ? `Hide ${label}` : `Show ${label}`}
      style={[
        {
          width: BAND_TAB_SIZE, height: BAND_TAB_SIZE, borderRadius: BAND_TAB_SIZE / 2,
          backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: semantic.borderStrong,
          alignItems: 'center', justifyContent: 'center',
        },
        shadowToken.card,
      ]}
    >
      <Animated.View style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
        <ChevronDown size={18} color={NAV_BG} strokeWidth={2.8} />
      </Animated.View>
    </Pressable>
  );
}

/** Animates its content's measured height and opacity with `progress` (0 closed, 1 open); stays mounted so it can animate. `gap` is the parent's gap it cancels while closed. */
export function BandCollapsible({ open, progress, children, gap = BAND_GAP }: { open: boolean; progress: Animated.Value; children: ReactNode; gap?: number }) {
  const [height, setHeight] = useState(0);

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={{
        overflow: 'hidden',
        opacity: progress,
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
        marginTop: progress.interpolate({ inputRange: [0, 1], outputRange: [-gap, 0] }),
      }}
    >
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}
