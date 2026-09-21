import { useRef, useState, type ReactNode } from 'react';
import {
  View, ScrollView, Pressable, RefreshControl, Animated, Easing,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DashboardHeaderContext, DashboardScrollContext } from '@/components/shared/DashboardBand';
import { semantic } from '@/theme/colors';
import type { Group } from '@/api/groups';
import type { GroupRole } from '@/constants/roles';

const SCROLLED_AT = 12; // the page counts as scrolled past this offset, and as back at the top under UNSCROLLED_AT
const UNSCROLLED_AT = 4;
const COLLAPSE_AT = 60; // the hero card collapses past this offset and returns once back under EXPAND_AT
const EXPAND_AT = 10;
const MIN_ROOM_AFTER_COLLAPSE = 80; // never collapse when the page couldn't keep scrolling afterwards, or it would flip back and forth
const COLLAPSE_MS = 240;

export function DashboardShell({
  group,
  role,
  children,
  refreshing,
  onRefresh,
  bottomBar,
  header,
  hero,
}: {
  group: Group;
  role: GroupRole;
  children: ReactNode;
  /** Optional pull-to-refresh — pass both to enable it. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Optional pinned bottom bar. */
  bottomBar?: ReactNode;
  /** Custom header — rendered inside the hero's DashboardBand instead of the default chevron/name/fund_code/badge row. */
  header?: ReactNode;
  /** Pinned above the scrolling content (the dashboard's DashboardBand). */
  hero?: ReactNode;
}) {
  const router = useRouter();
  const [collapse] = useState(() => new Animated.Value(0));
  const [collapsed, setCollapsed] = useState(false);
  const [scrollEpoch, setScrollEpoch] = useState(0);
  const collapseHeight = useRef(0);
  const reportCollapseHeight = (h: number) => { collapseHeight.current = h; };
  const scrolledRef = useRef(false);
  const collapsedRef = useRef(false);
  const contentHeight = useRef(0);
  const layoutHeight = useRef(0);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;

    const scrolled = scrolledRef.current ? y > UNSCROLLED_AT : y > SCROLLED_AT;
    if (scrolled !== scrolledRef.current) {
      scrolledRef.current = scrolled;
      if (scrolled) setScrollEpoch((n) => n + 1);
    }

    const room = contentHeight.current - layoutHeight.current;
    const shouldCollapse = collapsedRef.current ? y > EXPAND_AT : y > COLLAPSE_AT && room > collapseHeight.current + MIN_ROOM_AFTER_COLLAPSE;
    if (shouldCollapse !== collapsedRef.current) {
      collapsedRef.current = shouldCollapse;
      setCollapsed(shouldCollapse);
      Animated.timing(collapse, {
        toValue: shouldCollapse ? 1 : 0,
        duration: COLLAPSE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }

  return (
    <DashboardHeaderContext.Provider value={header ?? null}>
      <DashboardScrollContext.Provider value={{ collapse, collapsed, scrollEpoch, reportCollapseHeight }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={header ? [] : ['top']}>
          {header ? null : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 12,
                height: 60,
                borderBottomWidth: 1,
                borderBottomColor: semantic.border,
                backgroundColor: semantic.surface,
              }}
            >
              <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft size={24} color={semantic.textPrimary} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ fontSize: 16 }} numberOfLines={1}>{group.name}</Text>
                <Text variant="caption" color="secondary" style={{ letterSpacing: 1 }}>{group.fund_code}</Text>
              </View>
              <StatusBadge entity="role" value={role} />
            </View>
          )}

          {hero}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 20, gap: 6 }}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onContentSizeChange={(_w, h) => { contentHeight.current = h; }}
            onLayout={(e) => { layoutHeight.current = e.nativeEvent.layout.height; }}
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
          >
            {children}
          </ScrollView>

          {bottomBar}
        </SafeAreaView>
      </DashboardScrollContext.Provider>
    </DashboardHeaderContext.Provider>
  );
}
