import type { ReactNode } from 'react';
import Animated, { SlideInDown, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { semantic } from '@/theme/colors';

// How far the white message sheet rides up over the header band; pass `CHAT_SHEET_OVERLAP + 6` as the BandHeader's bottomPadding.
export const CHAT_SHEET_OVERLAP = 22;

/** The white panel holding a conversation (square top); it slides up over the header band when the chat opens. */
export function ChatSheet({ children }: { children: ReactNode }) {
  return (
    <Animated.View
      // Eased, not a spring — the spring overshot and made the sheet bounce as it settled.
      entering={SlideInDown.duration(320).easing(Easing.out(Easing.cubic))}
      style={{ flex: 1, marginTop: -CHAT_SHEET_OVERLAP, backgroundColor: semantic.surface, overflow: 'hidden' }}
    >
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        {children}
      </SafeAreaView>
    </Animated.View>
  );
}
