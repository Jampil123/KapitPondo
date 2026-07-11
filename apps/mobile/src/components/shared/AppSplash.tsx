import { useEffect, useRef } from 'react';
import { Platform, View, Animated, Easing } from 'react-native';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
import { ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { LogoMark } from '@/components/shared/ScreenHeader';
import { semantic } from '@/theme/colors';

export function Dots() {
  const a = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const loops = a.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {a.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: semantic.brand,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
          }}
        />
      ))}
    </View>
  );
}

export default function AppSplash() {
  return (
    <View style={{ flex: 1, backgroundColor: semantic.background, alignItems: 'center' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ marginBottom: 26 }}>
          <LogoMark size={96} />
        </View>
        <Text variant="displayLarge" style={{ fontSize: 32 }}>KapitPondo</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <View style={{ width: 18, height: 1.5, backgroundColor: semantic.brand, borderRadius: 2 }} />
          <Text variant="label" color="brand">Community Savings Made Simple</Text>
          <View style={{ width: 18, height: 1.5, backgroundColor: semantic.brand, borderRadius: 2 }} />
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 16, paddingBottom: 54 }}>
        <Dots />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.8 }}>
          <ShieldCheck size={14} color={semantic.textSecondary} />
          <Text variant="caption" color="secondary">Trusted · Secure · Community</Text>
        </View>
      </View>
    </View>
  );
}
