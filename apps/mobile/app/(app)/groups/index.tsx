import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, X, Users, UserPlus, Bell } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { GroupCard } from '@/components/shared/GroupCard';
import { SystemAnnouncements } from '@/components/shared/SystemAnnouncements';
import { Wordmark, LogoMark } from '@/components/shared/ScreenHeader';
import { semantic, shadowToken } from '@/theme/colors';
import { useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import type { MyGroup } from '@/api/groups';
import { CoachMark, type TargetRect } from '@/features/onboarding/CoachMark';
import { useOnboardingFlag } from '@/features/onboarding/useOnboardingFlag';

type TourStep = 'fab' | 'create' | null;

function initialsOf(name?: string | null) {
  if (!name) return 'K';
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'K';
}

export default function GroupsDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fabBottom = insets.bottom + 24;
  const { groups, loading, refresh } = useGroups();
  const { member } = useAuth();
  const { unreadCount } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [announcementsKey, setAnnouncementsKey] = useState(0);

  // First-run tutorial: walk a user with no groups to "Create Group".
  const { seen: tourSeen, markSeen: markTourSeen } = useOnboardingFlag('create-group');
  const [tourStep, setTourStep] = useState<TourStep>(null);
  const [tourTarget, setTourTarget] = useState<TargetRect | null>(null);
  const fabRef = useRef<View>(null);
  const createItemRef = useRef<View>(null);

  // Mounted hidden under a refreshed deeper page (initialRouteName), so the tour waits for focus.
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    // One-shot: marked seen the moment it starts, so it never comes back —
    // not after finishing, skipping, or closing the app halfway through.
    if (focused && tourSeen === false && !loading && groups.length === 0 && tourStep === null) {
      setTourStep('fab');
      markTourSeen();
    }
  }, [focused, tourSeen, loading, groups.length]);

  function measure(ref: React.RefObject<View | null>) {
    ref.current?.measureInWindow((x, y, width, height) => setTourTarget({ x, y, width, height }));
  }

  useEffect(() => {
    if (tourStep === 'fab') requestAnimationFrame(() => measure(fabRef));
  }, [tourStep]);

  function endTour() {
    setTourStep(null);
    setTourTarget(null);
    markTourSeen();
  }

  function goCreateFromTour() {
    endTour();
    setFabOpen(false);
    router.push('/(app)/groups/create');
  }

  async function onRefresh() {
    setRefreshing(true);
    setAnnouncementsKey((k) => k + 1);
    await refresh();
    setRefreshing(false);
  }

  function openGroup(item: MyGroup) {
    router.push({ pathname: '/(app)/[groupId]', params: { groupId: item.groups.id } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.surface }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          height: 60,
          borderBottomWidth: 1,
          borderBottomColor: semantic.border,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, marginLeft: 4 }}>
          <LogoMark size={28} />
          <Wordmark fontSize={20} />
        </View>

        <Pressable onPress={() => router.push('/(app)/notifications' as any)} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={22} color={semantic.textPrimary} />
          {unreadCount > 0 ? (
            <View
              style={{
                position: 'absolute', top: 2, right: 1, minWidth: 16, height: 16, borderRadius: 8,
                paddingHorizontal: 3, backgroundColor: '#E5484D', borderWidth: 1.5, borderColor: semantic.surface,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: '#fff', lineHeight: 12 }}>
                {unreadCount > 99 ? '99+' : unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => router.push('/(app)/groups/profile' as any)}
          style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{initialsOf(member?.full_name)}</Text>
        </Pressable>
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      ) : groups.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={{ alignSelf: 'stretch' }}><SystemAnnouncements /></View>
          <Pressable onPress={() => router.push('/(app)/groups/create')} style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{ width: 130, height: 100, borderWidth: 2, borderColor: semantic.borderStrong, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background }}>
              <Users size={56} color={semantic.textMuted} />
            </View>
          </Pressable>
          <Text variant="h1" style={{ fontSize: 20, textAlign: 'center' }}>No groups yet</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: fabBottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <SystemAnnouncements refreshKey={announcementsKey} />
          <Text variant="overline" color="secondary" style={{ marginBottom: 12 }}>My Groups</Text>
          <View style={{ gap: 12 }}>
            {groups.map((item) => (
              <GroupCard key={item.groups.id} item={item} onPress={() => openGroup(item)} />
            ))}
          </View>
        </ScrollView>
      )}

      {/* FAB mini-menu */}
      {fabOpen && (
        <View style={{ position: 'absolute', right: 20, bottom: fabBottom + 76, gap: 10, alignItems: 'flex-end' }}>
          {[
            { icon: Plus, label: 'Create Group', path: '/(app)/groups/create' as const },
            { icon: UserPlus, label: 'Join Group', path: '/(app)/groups/join' as const },
          ].map((it) => (
            <Pressable
              key={it.label}
              ref={it.label === 'Create Group' ? createItemRef : undefined}
              onLayout={it.label === 'Create Group' && tourStep === 'create' ? () => measure(createItemRef) : undefined}
              onPress={() => { setFabOpen(false); router.push(it.path); }}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 28 }, shadowToken.card]}
            >
              <Text variant="label">{it.label}</Text>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <it.icon size={20} color={semantic.brandDark} />
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* FAB */}
      <Pressable
        ref={fabRef}
        collapsable={false}
        onPress={() => setFabOpen((o) => !o)}
        style={[{ position: 'absolute', right: 24, bottom: fabBottom, width: 60, height: 60, borderRadius: 30, backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center' }, shadowToken.button]}
      >
        {fabOpen ? <X size={30} color="#fff" /> : <Plus size={30} color="#fff" />}
      </Pressable>

      {tourStep === 'fab' ? (
        <CoachMark
          visible
          target={tourTarget}
          radius={30}
          step={1}
          total={2}
          title="Tap + to start"
          onTargetPress={() => { setTourTarget(null); setFabOpen(true); setTourStep('create'); }}
          onSkip={endTour}
        />
      ) : tourStep === 'create' ? (
        <CoachMark
          visible
          target={tourTarget}
          radius={28}
          step={2}
          total={2}
          title="Create your group"
          body={member?.verification_status === 'verified'
            ? "You'll be its Organizer and can invite members next."
            : "You'll verify your ID first — then you can create it and invite members."}
          onTargetPress={goCreateFromTour}
          onSkip={() => { setFabOpen(false); endTour(); }}
        />
      ) : null}
    </SafeAreaView>
  );
}
