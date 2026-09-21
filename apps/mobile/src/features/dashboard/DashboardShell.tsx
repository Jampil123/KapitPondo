import { ReactNode, useMemo, useState } from 'react';
import { View, Pressable, RefreshControl, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BandTop, BAND_GAP, DashboardHeaderContext, DashboardFoldContext } from '@/components/shared/DashboardBand';
import { NAV_BG } from '@/components/shared/GroupSheetNav';
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
  foldHero,
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
  /** With a `header` and a `hero` band: keep the header pinned and slide the hero away as the page scrolls down, bring it back on scrolling up. */
  foldHero?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const folds = !!foldHero && !!header && !!hero;
  const [headerHeight, setHeaderHeight] = useState(0);
  const [bandHeight, setBandHeight] = useState(0);
  const [foldHeight, setFoldHeight] = useState(0);
  const foldDistance = foldHeight > 0 ? foldHeight + BAND_GAP : 0;

  // Everything here runs on the native thread: the scroll offset drives the fold, so it can't lag behind the finger. Only
  // the band's body moves, up to `foldDistance` (offset clamped at 0 so iOS bounce doesn't fold it). The list itself stays
  // put: moving the scroll view under a held finger makes its drag shift and the page vibrate.
  const [scroll] = useState(() => {
    const y = new Animated.Value(0);
    return {
      atLeastZero: y.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' }),
      onScroll: Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true }),
    };
  });
  const translateY = useMemo(
    () => Animated.multiply(Animated.diffClamp(scroll.atLeastZero, 0, foldDistance), -1),
    [scroll, foldDistance],
  );
  const foldContext = useMemo(() => ({ headerHeight, reportFoldHeight: setFoldHeight }), [headerHeight]);

  // The system spinner is hidden; this one sits at the very top of the screen, over the header band.
  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={!!refreshing}
      onRefresh={onRefresh}
      tintColor="transparent"
      colors={['transparent']}
      progressBackgroundColor="transparent"
      progressViewOffset={-200}
    />
  ) : undefined;

  const scrollView = (
    <Animated.ScrollView
      style={{ flex: 1 }}
      onScroll={folds ? scroll.onScroll : undefined}
      scrollEventThrottle={16}
      contentContainerStyle={{ padding: 20, paddingTop: 4 + (folds ? bandHeight : 0), gap: 6 }}
      refreshControl={refreshControl}
    >
      {children}
    </Animated.ScrollView>
  );

  return (
    <DashboardHeaderContext.Provider value={header ?? null}>
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

        {folds ? (
          <>
            <BandTop onHeight={setHeaderHeight}>{header}</BandTop>
            <View style={{ flex: 1, overflow: 'hidden' }}>
              {scrollView}
              <Animated.View
                onLayout={(e) => setBandHeight(e.nativeEvent.layout.height)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: [{ translateY }] }}
              >
                <DashboardFoldContext.Provider value={foldContext}>{hero}</DashboardFoldContext.Provider>
              </Animated.View>
            </View>
          </>
        ) : (
          <>
            {hero}
            {scrollView}
          </>
        )}

        {refreshing ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
            <View
              style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                shadowColor: '#2A3E4B', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
              }}
            >
              <ActivityIndicator color={NAV_BG} />
            </View>
          </View>
        ) : null}

        {bottomBar}
      </SafeAreaView>
    </DashboardHeaderContext.Provider>
  );
}
