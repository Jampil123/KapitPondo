import type { ReactNode } from 'react';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { semantic } from '@/theme/colors';

// How far the white message sheet rides up over the header band; pass `CHAT_SHEET_OVERLAP + 6` as the BandHeader's bottomPadding.
export const CHAT_SHEET_OVERLAP = 22;

/** The rounded white panel holding a conversation; it pulls up over the header band when the chat opens. */
export function ChatSheet({ children }: { children: ReactNode }) {
  return (
    <Animated.View
      entering={SlideInDown.springify().damping(20).stiffness(160)}
      style={{ flex: 1, marginTop: -CHAT_SHEET_OVERLAP, backgroundColor: semantic.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}
    >
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        {children}
      </SafeAreaView>
    </Animated.View>
  );
}
