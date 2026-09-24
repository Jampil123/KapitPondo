import { useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';

interface Props {
  label: string;
  /** Shown under the label while viewing an earlier period; tapping the label returns to the current one. */
  isPast: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  /** Null when the move is allowed; otherwise the reason it isn't, shown instead of moving. */
  prevBlocked: string | null;
  nextBlocked: string | null;
}

/** ‹ Period › stepper. Arrows stay tappable at the ends and explain why they can't move. */
export function PeriodSwitcher({ label, isPast, onPrev, onNext, onReset, prevBlocked, nextBlocked }: Props) {
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function attempt(blocked: string | null, go: () => void) {
    if (timer.current) clearTimeout(timer.current);
    if (blocked) {
      setHint(blocked);
      timer.current = setTimeout(() => setHint(null), 2500);
      return;
    }
    setHint(null);
    go();
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ArrowButton onPress={() => attempt(prevBlocked, onPrev)} muted={!!prevBlocked}>
          <ChevronLeft size={18} color={semantic.textPrimary} />
        </ArrowButton>
        <Pressable onPress={onReset} disabled={!isPast} hitSlop={6} style={{ alignItems: 'center', flex: 1, paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{label}</Text>
          {isPast ? (
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_500Medium', color: semantic.brandDark, marginTop: 1 }}>Back to current</Text>
          ) : null}
        </Pressable>
        <ArrowButton onPress={() => attempt(nextBlocked, onNext)} muted={!!nextBlocked}>
          <ChevronRight size={18} color={semantic.textPrimary} />
        </ArrowButton>
      </View>
      {hint ? (
        <View style={{ alignSelf: 'center', marginTop: 8, backgroundColor: intent.warning.soft, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: intent.warning.text }}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ArrowButton({ onPress, muted, children }: { onPress: () => void; muted: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: muted ? 0.45 : 1 }}
    >
      {children}
    </Pressable>
  );
}
