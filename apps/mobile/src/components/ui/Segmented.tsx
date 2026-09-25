/**
 * components/ui/Segmented.tsx
 * ----------------------------------------------------------------------------
 * Equal-width segmented control: a soft grey track with a white thumb that
 * slides under the active segment (e.g. Flags | Audit findings). Optional
 * count badge per segment.
 *
 *   <Segmented options={[{ key: 'flags', label: 'Flags' }, { key: 'findings', label: 'Audit findings', count: 2 }]}
 *              value={tab} onChange={setTab} />
 */
import { useEffect, useRef, useState } from 'react';
import { View, Pressable, Animated, type LayoutChangeEvent } from 'react-native';
import { Text } from './Text';
import { semantic, shadowToken } from '../../theme/colors';

export type SegOption<T extends string> = { key: T; label: string; count?: number; disabled?: boolean };

const PAD = 4;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const segWidth = trackWidth > 0 ? (trackWidth - PAD * 2) / options.length : 0;
  const [x] = useState(() => new Animated.Value(0));
  const placed = useRef(false);

  useEffect(() => {
    if (!segWidth) return;
    const to = index * segWidth;
    // First layout snaps into place; later changes slide.
    if (!placed.current) {
      x.setValue(to);
      placed.current = true;
    } else {
      Animated.spring(x, { toValue: to, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    }
  }, [index, segWidth, x]);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: PAD }}
    >
      {segWidth ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: PAD, bottom: PAD, left: PAD, width: segWidth, borderRadius: 11, backgroundColor: semantic.surface },
            shadowToken.soft,
            { transform: [{ translateX: x }] },
          ]}
        />
      ) : null}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            disabled={o.disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: !!o.disabled }}
            style={{ opacity: o.disabled ? 0.4 : 1, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
          >
            <Text style={{ fontSize: 13, fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium', color: active ? semantic.textPrimary : semantic.textSecondary }} numberOfLines={1}>
              {o.label}
            </Text>
            {o.count ? (
              <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: active ? semantic.surfaceAlt : semantic.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{o.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
