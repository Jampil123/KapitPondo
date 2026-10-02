import { useState } from 'react';
import { View, Pressable, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Text } from '@/components/ui/Text';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
import { semantic, shadowToken } from '@/theme/colors';

export type TileAction = { label: string; icon: any; route: string; params?: Record<string, string> };

/**
 * Shortcut tiles in one horizontally-scrollable row, 4 in view, with a thin
 * "scroll level" track beneath it showing how far through the row you are —
 * standalone tiles don't hint that there's more off-screen, this does.
 */
export function ScrollTileRow({ actions, go }: { actions: TileAction[]; go: (route: string, params?: Record<string, string>) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [visibleWidth, setVisibleWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const scrollable = contentWidth > visibleWidth + 1;
  const thumbWidth = scrollable ? Math.max(28, (visibleWidth / contentWidth) * trackWidth) : trackWidth;
  const maxScrollX = Math.max(1, contentWidth - visibleWidth);
  const maxThumbTravel = Math.max(0, trackWidth - thumbWidth);
  const thumbLeft = scrollable ? Math.min(maxThumbTravel, (scrollX / maxScrollX) * maxThumbTravel) : 0;

  // Exactly 4 tiles fill the row's width — computed from the measured width,
  // since a horizontal ScrollView's content isn't stretched to fit its viewport.
  const GAP = 10;
  const tileWidth = visibleWidth > 0 ? (visibleWidth - GAP * 3) / 4 : 84;

  return (
    <View style={{ marginTop: 14 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setVisibleWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollX(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: GAP, paddingVertical: 6 }}
      >
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => go(a.route, a.params)}
            style={[{ width: tileWidth, borderRadius: 18, backgroundColor: semantic.card, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, gap: 10 }, shadowToken.soft]}
          >
            <a.icon size={26} color={NAV_BG} strokeWidth={1.8} />
            <Text variant="caption" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 14 }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {scrollable ? (
        <View
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={{ width: 56, height: 3, borderRadius: 1.5, backgroundColor: semantic.border, marginTop: 18, alignSelf: 'center', overflow: 'hidden' }}
        >
          <View style={{ width: thumbWidth, height: '100%', borderRadius: 1.5, backgroundColor: semantic.brand, transform: [{ translateX: thumbLeft }] }} />
        </View>
      ) : null}
    </View>
  );
}
