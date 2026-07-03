/**
 * components/shared/DashboardNav.tsx
 * ----------------------------------------------------------------------------
 * The owner's group-scoped bottom nav: Chat | Services | (+) | Profile | More,
 * with a raised circular action button in the center. Supersedes OrganizerNav
 * for the owner role — Members/Loans/Year-End now live under "More".
 */
import { View, Pressable, Alert } from 'react-native';
import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Grid3x3, Plus, UserCircle, Ellipsis } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic, shadowToken } from '../../theme/colors';

const TABS: { key: string; label: string; icon: any }[] = [
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'services', label: 'Services', icon: Grid3x3 },
];
const RIGHT_TABS: { key: string; label: string; icon: any }[] = [
  { key: 'profile', label: 'Profile', icon: UserCircle },
  { key: 'more', label: 'More', icon: Ellipsis },
];

export function DashboardNav() {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  function go(key: string) {
    if (key === 'profile') {
      router.push('/(app)/groups/profile');
    } else {
      router.push({ pathname: `/(app)/[groupId]/${key}` as any, params: { groupId } });
    }
  }

  function renderTab(t: { key: string; label: string; icon: any }) {
    const active = t.key === 'profile' ? path === '/(app)/groups/profile' : path.endsWith(`/${t.key}`);
    const color = active ? semantic.brandDark : semantic.textMuted;
    return (
      <Pressable key={t.key} onPress={() => go(t.key)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
        <t.icon size={22} color={color} strokeWidth={1.8} />
        <Text style={{ fontSize: 10, fontFamily: 'Poppins_500Medium', color }}>{t.label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingTop: 10, height: 66 + insets.bottom, paddingBottom: insets.bottom, backgroundColor: 'rgba(247,251,253,0.96)', borderTopWidth: 1, borderColor: '#E2EBF0' }}>
      {TABS.map(renderTab)}

      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable
          onPress={() => Alert.alert('Quick actions', 'Coming soon.')}
          style={[
            {
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: semantic.brand,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: -28,
            },
            shadowToken.button,
          ]}
        >
          <Plus size={26} color="#fff" />
        </Pressable>
      </View>

      {RIGHT_TABS.map(renderTab)}
    </View>
  );
}
