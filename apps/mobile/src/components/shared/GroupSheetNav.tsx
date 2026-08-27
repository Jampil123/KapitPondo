/**
 * components/shared/GroupSheetNav.tsx
 * ----------------------------------------------------------------------------
 * Generic 5-slot bottom nav (Chat · Home · + · Profile · More) with the
 * elevated center button and bottom sheets — the zip's pattern. The CHROME is
 * shared; each role passes its own sheet configs, so OrganizerNav and MemberNav
 * are just configs (no duplicated bar code). Home is a direct nav (like
 * Profile) back to the group's dashboard — no sheet needed.
 *
 * Sheet items route to a group-scoped screen, jump to the groups list
 * ('@groups'), run a callback, or show "Soon".
 *
 * Chrome is a floating dark pill, glyphs only (no labels) — the active tab
 * sits in a lit recess with a small glowing dash above it, and the center
 * action is a glowing blue FAB, matching the reference redesign.
 */
import { useState } from 'react';
import { View, Pressable, Modal, Alert } from 'react-native';
import { router, usePathname, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, Home, Plus, User, Menu, X } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic, shadowToken } from '../../theme/colors';

export type SheetItem = { label: string; icon: any } & (
  | { route: string }
  | { soon: true }
  | { onPress: () => void }
);
export type SheetConfig = { title: string; subtitle?: string; items: SheetItem[] };

const NAV_BG = semantic.dashCard;
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

export function GroupSheetNav({
  chat, add, more, centerIcon: CenterIcon = Plus, onCenterPress,
}: {
  chat: SheetConfig; add: SheetConfig; more: SheetConfig;
  /** Override the center FAB glyph — e.g. Search for a role that never creates entries. */
  centerIcon?: any;
  /** Override what the center FAB does — defaults to opening the `add` sheet. */
  onCenterPress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [active, setActive] = useState<SheetConfig | null>(null);

  const isHome = path === `/(app)/${groupId}`;
  const isProfile = path.endsWith('/profile');

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
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          marginHorizontal: 16, marginTop: 8, marginBottom: Math.max(insets.bottom, 14),
          height: 66, borderRadius: 26, paddingHorizontal: 8,
          backgroundColor: NAV_BG,
          shadowColor: '#12303C', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.34, shadowRadius: 22, elevation: 10,
        }}
      >
        <NavItem icon={Home} active={isHome} onPress={() => router.push({ pathname: '/(app)/[groupId]', params: { groupId } })} />
        <NavItem icon={MessageCircle} onPress={() => setActive(chat)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable
            onPress={onCenterPress ?? (() => setActive(add))}
            style={{
              width: 52, height: 52, borderRadius: 18, backgroundColor: NAV_FAB,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: NAV_FAB, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.7, shadowRadius: 16, elevation: 8,
            }}
          >
            <CenterIcon size={26} color="#fff" strokeWidth={2.6} />
          </Pressable>
        </View>
        <NavItem icon={User} active={isProfile} onPress={() => router.push({ pathname: '/(app)/[groupId]/profile', params: { groupId } })} />
        <NavItem icon={Menu} onPress={() => setActive(more)} />
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
