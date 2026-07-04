/**
 * components/shared/GroupSheetNav.tsx
 * ----------------------------------------------------------------------------
 * Generic 5-slot bottom nav (Chat · Services · + · Profile · More) with the
 * elevated center button and bottom sheets — the zip's pattern. The CHROME is
 * shared; each role passes its own sheet configs, so OrganizerNav and MemberNav
 * are just configs (no duplicated bar code).
 *
 * Sheet items route to a group-scoped screen, jump to the groups list
 * ('@groups'), run a callback, or show "Soon".
 */
import { useState } from 'react';
import { View, Pressable, Modal, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, LayoutGrid, Plus, User, MoreHorizontal, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic, shadowToken } from '../../theme/colors';

export type SheetItem = { label: string; icon: any } & (
  | { route: string }
  | { soon: true }
  | { onPress: () => void }
);
export type SheetConfig = { title: string; subtitle?: string; items: SheetItem[] };

function NavItem({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Icon size={23} color={semantic.textMuted} strokeWidth={1.8} />
      <Text style={{ fontSize: 10, fontFamily: 'Poppins_500Medium', color: semantic.textMuted }}>{label}</Text>
    </Pressable>
  );
}

export function GroupSheetNav({ chat, services, add, more }: { chat: SheetConfig; services: SheetConfig; add: SheetConfig; more: SheetConfig }) {
  const insets = useSafeAreaInsets();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [active, setActive] = useState<SheetConfig | null>(null);

  function handleItem(it: SheetItem) {
    setActive(null);
    if ('soon' in it) return void Alert.alert(it.label, 'Coming soon.');
    if ('onPress' in it) return it.onPress();
    if (it.route === '@groups') router.replace('/(app)/groups');
    else router.push({ pathname: `/(app)/[groupId]/${it.route}` as any, params: { groupId } });
  }

  return (
    <>
      <View
        style={{
          flexDirection: 'row', alignItems: 'flex-start', paddingTop: 11,
          height: 74 + insets.bottom, paddingBottom: insets.bottom,
          backgroundColor: 'rgba(247,251,253,0.96)', borderTopWidth: 1, borderColor: '#E2EBF0',
        }}
      >
        <NavItem icon={MessageCircle} label="Chat" onPress={() => setActive(chat)} />
        <NavItem icon={LayoutGrid} label="Services" onPress={() => setActive(services)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable
            onPress={() => setActive(add)}
            style={{
              width: 62, height: 62, borderRadius: 31, backgroundColor: semantic.brand,
              alignItems: 'center', justifyContent: 'center', transform: [{ translateY: -22 }],
              borderWidth: 5, borderColor: semantic.background,
              shadowColor: semantic.brand, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 6,
            }}
          >
            <Plus size={28} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </View>
        <NavItem icon={User} label="Profile" onPress={() => router.push({ pathname: '/(app)/[groupId]/profile', params: { groupId } })} />
        <NavItem icon={MoreHorizontal} label="More" onPress={() => setActive(more)} />
      </View>

      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={() => setActive(null)}>
          <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text variant="h3" style={{ fontSize: 17 }}>{active?.title}</Text>
                {active?.subtitle ? <Text variant="caption" color="secondary">{active.subtitle}</Text> : null}
              </View>
              <Pressable onPress={() => setActive(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            <View style={{ gap: 8 }}>
              {active?.items.map((it) => (
                <Pressable key={it.label} onPress={() => handleItem(it)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: semantic.background, borderRadius: 14, padding: 13 }, shadowToken.card]}>
                  <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <it.icon size={20} color={semantic.brandDark} />
                  </View>
                  <Text variant="label" style={{ flex: 1 }}>{it.label}</Text>
                  {'soon' in it ? <Text variant="caption" color="muted">Soon</Text> : null}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
