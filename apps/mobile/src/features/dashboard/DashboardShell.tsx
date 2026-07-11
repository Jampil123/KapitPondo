/**
 * features/dashboard/DashboardShell.tsx
 * ----------------------------------------------------------------------------
 * The common frame every role dashboard shares: back button, group name +
 * fund code, the caller's role badge, and a scroll container with optional
 * pull-to-refresh. Role-specific content slots in as children, so all four
 * dashboards look like one app.
 */
import { ReactNode } from 'react';
import { View, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
}: {
  group: Group;
  role: GroupRole;
  children: ReactNode;
  /** Optional pull-to-refresh — pass both to enable it. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Optional pinned bottom bar (e.g. DashboardNav for the owner). */
  bottomBar?: ReactNode;
  /** Optional custom header — replaces the default chevron/name/fund_code/badge row. */
  header?: ReactNode;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      {header ?? (
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 40, gap: 16 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>

      {bottomBar}
    </SafeAreaView>
  );
}
