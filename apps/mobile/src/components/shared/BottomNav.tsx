/**
 * components/shared/BottomNav.tsx
 * ----------------------------------------------------------------------------
 * A plain bottom navbar (not an Expo Router Tabs navigator). Drop it at the
 * bottom of a screen and tell it which tab is active:
 *
 *   <BottomNav active="home" />       // on groups/index.tsx
 *   <BottomNav active="profile" />    // on groups/profile.tsx
 *
 * It sits above the home indicator via safe-area inset. Because it navigates
 * with router.replace, tapping between Home/Profile doesn't stack screens.
 */
import { useRef } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, UserCircle } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic } from '../../theme/colors';

type Tab = 'home' | 'profile';

// `active` comes from the CURRENT screen's own prop, which hasn't updated yet
// mid-transition — so two fast taps on the same tab both see the old
// `isActive` and both fire router.replace, doubling the navigation. Guard by
// time instead, same fix as Button.tsx.
const DOUBLE_TAP_GUARD_MS = 700;

const TABS: { key: Tab; label: string; icon: any; path: '/(app)/groups' | '/(app)/groups/profile' }[] = [
  { key: 'home', label: 'Home', icon: Users, path: '/(app)/groups' },
  { key: 'profile', label: 'Profile', icon: UserCircle, path: '/(app)/groups/profile' },
];

export function BottomNav({ active }: { active: Tab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lastPressAt = useRef(0);

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: semantic.border,
        backgroundColor: semantic.surface,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive ? semantic.brandDark : semantic.textMuted;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              if (isActive) return;
              const now = Date.now();
              if (now - lastPressAt.current < DOUBLE_TAP_GUARD_MS) return;
              lastPressAt.current = now;
              router.replace(t.path);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 }}
          >
            <t.icon size={24} color={color} />
            <Text variant="caption" style={{ color, fontFamily: 'Poppins_500Medium' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
