import { useState } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { MessageCircle, Plus, User, Menu, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic, intent, shadowToken } from '../../theme/colors';
import { useChatOverview } from '../../features/chat/chatOverview';
import { activeGroupTab, type GroupTab } from './groupTabs';

export type SheetItem = { label: string; icon: any; route: string; params?: Record<string, string> };
export type SheetConfig = { title: string; items: SheetItem[] };

export const NAV_BG = '#12303C'; // darker than semantic.dashCard — deliberately the darkest surface in the app
const NAV_ICON = 'rgba(255,255,255,0.8)';
const NAV_ICON_ON = '#FFFFFF';
const NAV_SPARK = '#2FA8FF';
// Same glow accent as the (auth)/landing.tsx welcome screen (its GLOW constant).
const NAV_FAB = '#7FA6B8';

const TABS: { key: Exclude<GroupTab, 'home'>; label: string; icon: any }[] = [
  { key: 'messages', label: 'Chat', icon: MessageCircle },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'more', label: 'More', icon: Menu },
];

// The open tab stretches to show its label; the others shrink to just an icon.
function NavItem({ icon: Icon, label, onPress, active, badge }: { icon: any; label: string; onPress: () => void; active: boolean; badge?: number }) {
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={{ flexGrow: active ? 2.2 : 1, flexBasis: 0 }}>
      <Pressable
        onPress={onPress}
        disabled={active}
        accessibilityRole="tab"
        accessibilityState={{ selected: active, disabled: active }}
        accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
        style={{
          height: 48, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
          backgroundColor: active ? 'rgba(255,255,255,0.14)' : 'transparent',
        }}
      >
        <View>
          <Icon size={21} color={active ? NAV_ICON_ON : NAV_ICON} strokeWidth={1.85} />
          {badge ? (
            <View
              style={{
                position: 'absolute', top: -7, left: 12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
                backgroundColor: intent.danger.base, borderWidth: 2, borderColor: NAV_BG, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 9.5, lineHeight: 12, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          ) : null}
        </View>
        {active ? (
          <Animated.Text entering={FadeIn.duration(180)} numberOfLines={1} style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: NAV_ICON_ON }}>
            {label}
          </Animated.Text>
        ) : null}
        {active ? (
          <View
            style={{
              position: 'absolute', top: 5, width: 16, height: 2.5, borderRadius: 2, backgroundColor: NAV_SPARK,
              shadowColor: NAV_SPARK, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
            }}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function GroupSheetNav({ add }: { add: SheetConfig }) {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const { unreadCount } = useChatOverview(groupId);

  const tab = activeGroupTab(path);
  const navBottom = Math.max(insets.bottom, 14);

  // The nav only shows on the dashboard, so each tab opens as a page on top of it and Back returns here.
  function goTab(target: GroupTab) {
    if (target === tab) return;
    router.push({ pathname: `/(app)/[groupId]/${target}` as any, params: { groupId } });
  }

  function handleItem(it: SheetItem) {
    setMenuOpen(false);
    router.push({ pathname: `/(app)/[groupId]/${it.route}` as any, params: { groupId, ...it.params } });
  }

  return (
    <>
      <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, marginBottom: navBottom, backgroundColor: 'transparent' }}>
        {/* Chat, Profile and More, grouped in one pill */}
        <View
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
            height: 62, borderRadius: 26, paddingHorizontal: 7,
            backgroundColor: NAV_BG,
          }}
        >
          {TABS.map((t) => (
            <NavItem key={t.key} icon={t.icon} label={t.label} active={tab === t.key} badge={t.key === 'messages' ? unreadCount : undefined} onPress={() => goTab(t.key)} />
          ))}
        </View>

        {/* Quick actions, on their own to the right */}
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityLabel={add.title}
          style={{
            width: 62, height: 62, borderRadius: 31, backgroundColor: NAV_FAB,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Plus size={27} color="#fff" strokeWidth={2.6} />
        </Pressable>
      </View>

      {/* Floating menu above the + (same pattern as My Groups' button), not a
          pull-up sheet. The modal only supplies a tap-outside-to-close layer;
          the × sits exactly where the + was. */}
      <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.25)' }} onPress={() => setMenuOpen(false)}>
          <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: navBottom + 62 + 14, gap: 10, alignItems: 'flex-end' }}>
            {add.items.map((it, i) => (
              <Animated.View key={it.label} entering={FadeInDown.duration(180).delay((add.items.length - 1 - i) * 40)}>
                <Pressable
                  onPress={() => handleItem(it)}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderRadius: 28 }, shadowToken.card]}
                >
                  <Text variant="label">{it.label}</Text>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <it.icon size={20} color={semantic.brandDark} />
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
          <Pressable
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close quick actions"
            style={{ position: 'absolute', right: 16, bottom: navBottom, width: 62, height: 62, borderRadius: 31, backgroundColor: NAV_FAB, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={27} color="#fff" strokeWidth={2.6} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
