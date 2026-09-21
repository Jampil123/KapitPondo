import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, ScrollView, Pressable, RefreshControl, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DashboardHeaderContext, DashboardScrollContext } from '@/components/shared/DashboardBand';
import { semantic } from '@/theme/colors';
import type { Group } from '@/api/groups';
import type { GroupRole } from '@/constants/roles';

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
  const [collapsed, setCollapsed] = useState(false);
  const heroHeight = useRef(0);
  const reportHeroHeight = useCallback((height: number) => { heroHeight.current = height; }, []);
  const scrollContext = useMemo(() => ({ collapsed, reportHeroHeight }), [collapsed, reportHeroHeight]);

  // Fold the band's card away once the page is scrolled, and bring it back only at the very top. Skipped when the
  // content couldn't keep scrolling after the card is gone: the freed space would push the offset back to 0 and re-open it.
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    if (!collapsed && y > 40 && contentSize.height > layoutMeasurement.height + heroHeight.current + 24) setCollapsed(true);
    else if (collapsed && y <= 4) setCollapsed(false);
  }

  return (
    <DashboardHeaderContext.Provider value={header ?? null}>
      <DashboardScrollContext.Provider value={scrollContext}>
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
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 20, gap: 6 }}
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
