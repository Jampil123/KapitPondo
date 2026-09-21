import { useState } from 'react';
import { View, Pressable, Modal } from 'react-native';
import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Home, Plus, User, Menu, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic } from '../../theme/colors';
import { activeGroupTab, type GroupTab } from './groupTabs';

export type SheetItem = { label: string; icon: any; route: string; params?: Record<string, string> };
export type SheetConfig = { title: string; items: SheetItem[] };

const NAV_BG = '#12303C'; // darker than semantic.dashCard — deliberately the darkest surface in the app
const NAV_ICON = 'rgba(255,255,255,0.8)';
const NAV_ICON_ON = '#FFFFFF';
const NAV_SPARK = '#2FA8FF';
// Same glow accent as the (auth)/landing.tsx welcome screen (its GLOW constant).
const NAV_FAB = '#7FA6B8';

function NavItem({ icon: Icon, onPress, active }: { icon: any; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
          backgroundColor: active ? 'rgba(255,255,255,0.13)' : 'transparent',
        }}
      >
        {active ? (
          <View
            style={{
              position: 'absolute', top: 6, width: 16, height: 2.5, borderRadius: 2, backgroundColor: NAV_SPARK,
              shadowColor: NAV_SPARK, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
            }}
          />
        ) : null}
        <Icon size={22} color={active ? NAV_ICON_ON : NAV_ICON} strokeWidth={1.85} />
      </View>
    </Pressable>
  );
}

export function GroupSheetNav({ add }: { add: SheetConfig }) {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [sheetOpen, setSheetOpen] = useState(false);

  const tab = activeGroupTab(path);

  // Home pops back to the existing dashboard; other tabs replace each other so the stack never grows past Home + one tab.
  function goTab(target: GroupTab) {
    if (target === tab) return;
    if (target === 'home') return router.dismissTo({ pathname: '/(app)/[groupId]', params: { groupId } });
    const href = { pathname: `/(app)/[groupId]/${target}` as any, params: { groupId } };
    if (tab === 'home') router.push(href);
    else router.replace(href);
  }

  function handleItem(it: SheetItem) {
    setSheetOpen(false);
    router.push({ pathname: `/(app)/[groupId]/${it.route}` as any, params: { groupId, ...it.params } });
  }

  return (
    <>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          marginHorizontal: 16, marginTop: 8, marginBottom: Math.max(insets.bottom, 14),
          height: 66, borderRadius: 26, paddingHorizontal: 8,
          backgroundColor: NAV_BG,
          shadowColor: '#12303C', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.34, shadowRadius: 22, elevation: 10,
        }}
      >
        <NavItem icon={Home} active={tab === 'home'} onPress={() => goTab('home')} />
        <NavItem icon={MessageCircle} active={tab === 'messages'} onPress={() => goTab('messages')} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable
            onPress={() => setSheetOpen(true)}
            style={{
              width: 52, height: 52, borderRadius: 18, backgroundColor: NAV_FAB,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: NAV_FAB, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.7, shadowRadius: 16, elevation: 8,
            }}
          >
            <Plus size={26} color="#fff" strokeWidth={2.6} />
          </Pressable>
        </View>
        <NavItem icon={User} active={tab === 'profile'} onPress={() => goTab('profile')} />
        <NavItem icon={Menu} active={tab === 'more'} onPress={() => goTab('more')} />
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
