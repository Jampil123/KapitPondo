/**
 * components/shared/ChatbotFAB.tsx
 * Floating "ask KapitBot" button — sits in the lower right of every
 * dashboard, above the group's bottom nav (used from DashboardShell.tsx,
 * which already renders the nav bar as a separate box below this one, so
 * `bottom` just controls how far up the FAB sits, not overlap-avoidance).
 *
 * `hasUnread` is a plain prop, not backed by any real signal — the chatbot
 * (services/api/src/modules/ai) never initiates a message on its own, so
 * nothing currently has a reason to set this true. It's wired through in
 * case a future feature (e.g. a proactive tip) needs it.
 */
import { useEffect, useRef } from 'react';
import { View, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';

const FAB_SIZE = 58;
const GRADIENT = [semantic.brand, semantic.dashCard] as const;

export function ChatbotFAB({
  onPress,
  hasUnread = false,
  bottom = 100,
  right = 20,
}: {
  onPress: () => void;
  hasUnread?: boolean;
  /** Sits above the floating dark nav — default clears it with room to spare. */
  bottom?: number;
  right?: number;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const pulseStyle = {
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.3] }) }],
    opacity: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 0, 0] }),
  };

  return (
    <View style={[styles.wrap, { bottom, right }]} pointerEvents="box-none">
      <Animated.View style={[styles.pulseRing, pulseStyle]} />

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.96 : 1 }] }]}
        accessibilityLabel="Open KapitBot AI assistant"
        accessibilityRole="button"
      >
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
          {hasUnread ? <View style={styles.unreadDot} /> : null}
          <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  pulseRing: {
    position: 'absolute',
    width: FAB_SIZE + 8,
    height: FAB_SIZE + 8,
    borderRadius: (FAB_SIZE + 8) / 2,
    backgroundColor: 'rgba(106,147,166,0.35)', // semantic.brand, alpha'd
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: semantic.dashCard,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 10,
  },
  aiBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  aiBadgeText: {
    fontSize: 9,
    fontFamily: 'Poppins_800ExtraBold',
    color: semantic.brandDark,
    letterSpacing: 0.5,
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: intent.danger.base,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
