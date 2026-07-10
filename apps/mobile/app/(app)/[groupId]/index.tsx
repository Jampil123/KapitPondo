/**
 * app/(app)/[groupId]/index.tsx — the ONE group dashboard, role-switched.
 * All four dashboards live here; the screen picks one from the caller's role in
 * THIS group. Now also handles the non-dashboard states:
 *   - still loading the groups list        → spinner
 *   - not a member of this group           → "no access"
 *   - joined but not yet approved (pending) → "waiting for approval"
 */
import { useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Clock, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { DashboardShell } from '@/features/dashboard/DashboardShell';
import { DashboardHeader } from '@/components/shared/DashboardHeader';
import { OwnerDashboard } from '@/features/dashboard/OwnerDashboard';
import { TreasurerDashboard } from '@/features/dashboard/TreasurerDashboard';
import { AuditorDashboard } from '@/features/dashboard/AuditorDashboard';
import { MemberDashboard } from '@/features/dashboard/MemberDashboard';
import { semantic } from '@/theme/colors';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background, padding: 32, gap: 10 }}>
      {children}
    </View>
  );
}

/**
 * PayMaya-style account switcher (Wallet · Savings · Credit · …): auto-width
 * items with gaps, no surrounding box — active item gets a solid pill, inactive
 * items are plain text. Kept local/one-off rather than restyling the shared
 * Segmented control, which other screens use as an equal-width tab bar.
 */
function RoleSwitch({ value, onChange }: { value: 'officer' | 'member'; onChange: (v: 'officer' | 'member') => void }) {
  const options: { key: 'officer' | 'member'; label: string }[] = [
    { key: 'officer', label: 'Officer' },
    { key: 'member', label: 'Member' },
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: active ? 18 : 10,
              borderRadius: 999,
              backgroundColor: active ? semantic.brand : 'transparent',
            }}
          >
            <Text variant="label" style={{ fontSize: 13.5, fontWeight: active ? '700' : '500', color: active ? '#fff' : semantic.textSecondary }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function GroupDashboard() {
  const router = useRouter();
  const { group, role, groupId, membership } = useActiveGroup();
  const { loading, refresh } = useGroups();
  const { member } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [treasurerView, setTreasurerView] = useState<'officer' | 'member'>('officer');
  const [ownerView, setOwnerView] = useState<'officer' | 'member'>('officer');
  const [auditorView, setAuditorView] = useState<'officer' | 'member'>('officer');

  // Each dashboard's data hooks live inside its own component tree, so
  // rather than threading refetch callbacks through every nested piece,
  // bumping `refreshKey` remounts the active dashboard — every hook inside
  // it (useSummary, useLoans, etc.) refetches fresh, same end result.
  async function onRefresh() {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    await refresh();
    setRefreshing(false);
  }

  // Groups list still loading and we don't have this group resolved yet.
  if (loading && !membership) {
    return (
      <Centered>
        <ActivityIndicator color={semantic.brand} />
      </Centered>
    );
  }

  // Loaded, but the caller isn't a member of this group.
  if (!membership) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Group" />
        <Centered>
          <Lock size={40} color={semantic.textMuted} />
          <Text variant="h3" style={{ fontSize: 16 }}>No access</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            You're not a member of this group.
          </Text>
          <Button label="Back to My Groups" variant="ghost" onPress={() => router.replace('/(app)/groups')} />
        </Centered>
      </SafeAreaView>
    );
  }

  // Joined but the owner hasn't approved yet.
  if (membership.status === 'pending') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title={group?.name ?? 'Group'} />
        <Centered>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={34} color={semantic.brandDark} />
          </View>
          <Text variant="h2" style={{ fontSize: 19, textAlign: 'center' }}>Waiting for approval</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            The owner hasn't approved your request to join {group?.name ?? 'this group'} yet. You'll get access as soon as they do.
          </Text>
          <Button label="Back to My Groups" variant="ghost" onPress={() => router.replace('/(app)/groups')} />
        </Centered>
      </SafeAreaView>
    );
  }

  // Active member — show the role's dashboard.
  if (!group || !role) {
    return (
      <Centered>
        <ActivityIndicator color={semantic.brand} />
      </Centered>
    );
  }

  return (
    <DashboardShell
      group={group}
      role={role}
      header={
        <>
          <DashboardHeader group={group} member={member} roleLabel={ROLE_LABEL[role]} />
          {role === 'treasurer' && (
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, backgroundColor: semantic.background }}>
              <RoleSwitch value={treasurerView} onChange={setTreasurerView} />
            </View>
          )}
          {role === 'owner' && (
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, backgroundColor: semantic.background }}>
              <RoleSwitch value={ownerView} onChange={setOwnerView} />
            </View>
          )}
          {role === 'auditor' && (
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, backgroundColor: semantic.background }}>
              <RoleSwitch value={auditorView} onChange={setAuditorView} />
            </View>
          )}
        </>
      }
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {role === 'owner' && (
        ownerView === 'officer'
          ? <OwnerDashboard key={refreshKey} groupId={groupId!} />
          : <MemberDashboard key={refreshKey} groupId={groupId!} />
      )}
      {role === 'treasurer' && (
        treasurerView === 'officer'
          ? <TreasurerDashboard key={refreshKey} groupId={groupId!} />
          : <MemberDashboard key={refreshKey} groupId={groupId!} />
      )}
      {role === 'auditor' && (
        auditorView === 'officer'
          ? <AuditorDashboard key={refreshKey} groupId={groupId!} />
          : <MemberDashboard key={refreshKey} groupId={groupId!} />
      )}
      {role === 'member' && <MemberDashboard key={refreshKey} groupId={groupId!} />}
    </DashboardShell>
  );
}
