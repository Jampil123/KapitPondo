/**
 * app/(app)/groups/index.tsx — the main dashboard (groups list).
 * Migrated to our primitives + GroupContext. Every group opens the SAME
 * [groupId] route; the dashboard there switches on role via useActiveGroup().
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, X, Users, UserPlus, Bell } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { GroupCard } from '@/components/shared/GroupCard';
import { Wordmark, LogoMark } from '@/components/shared/ScreenHeader';
import { semantic, shadowToken } from '@/theme/colors';
import { useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import type { MyGroup } from '@/api/groups';

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

  async function onRefresh() {
    setRefreshing(true);
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
          <Pressable onPress={() => router.push('/(app)/groups/create')} style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{ width: 130, height: 100, borderWidth: 2, borderColor: semantic.borderStrong, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background }}>
              <Users size={56} color={semantic.textMuted} />
            </View>
          </Pressable>
          <Text variant="h1" style={{ fontSize: 20, marginBottom: 10, textAlign: 'center' }}>No groups yet</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            Create or join a savings group to start managing your finances together.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: fabBottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
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
        onPress={() => setFabOpen((o) => !o)}
        style={[{ position: 'absolute', right: 24, bottom: fabBottom, width: 60, height: 60, borderRadius: 30, backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center' }, shadowToken.button]}
      >
        {fabOpen ? <X size={30} color="#fff" /> : <Plus size={30} color="#fff" />}
      </Pressable>
    </SafeAreaView>
  );
}
