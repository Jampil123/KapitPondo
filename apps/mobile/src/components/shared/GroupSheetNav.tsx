import { useState } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { MessageCircle, Plus, User, Menu, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic, intent } from '../../theme/colors';
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const { unreadCount } = useChatOverview(groupId);

  const tab = activeGroupTab(path);

  // The nav only shows on the dashboard, so each tab opens as a page on top of it and Back returns here.
  function goTab(target: GroupTab) {
    if (target === tab) return;
    router.push({ pathname: `/(app)/[groupId]/${target}` as any, params: { groupId } });
  }

  function handleItem(it: SheetItem) {
    setSheetOpen(false);
    router.push({ pathname: `/(app)/[groupId]/${it.route}` as any, params: { groupId, ...it.params } });
  }

  return (
    <>
      <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, marginBottom: Math.max(insets.bottom, 14), backgroundColor: 'transparent' }}>
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

        {/* Quick add, on its own to the right */}
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityLabel={add.title}
          style={{
            width: 62, height: 62, borderRadius: 31, backgroundColor: NAV_FAB,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Plus size={27} color="#fff" strokeWidth={2.6} />
        </Pressable>
      </View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={() => setSheetOpen(false)}>
          <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text variant="h3" style={{ fontSize: 17, flex: 1 }}>{add.title}</Text>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {add.items.map((it) => (
              <Pressable
                key={it.label}
                onPress={() => handleItem(it)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 }}
              >
                <it.icon size={22} color={semantic.brandDark} />
                <Text variant="label" style={{ flex: 1 }}>{it.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
