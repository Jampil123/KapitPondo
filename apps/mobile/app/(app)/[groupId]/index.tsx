/**
 * app/(app)/[groupId]/index.tsx — the ONE group dashboard, role-switched.
 * All four dashboards live here; the screen picks one from the caller's role in
 * THIS group. Now also handles the non-dashboard states:
 *   - still loading the groups list        → spinner
 *   - not a member of this group           → "no access"
 *   - joined but not yet approved (pending) → "waiting for approval"
 */
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Clock, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import { DashboardShell } from '@/features/dashboard/DashboardShell';
import { OrganizerNav } from '@/components/shared/OrganizerNav';
import { MemberNav } from '@/components/shared/MemberNav';
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

export default function GroupDashboard() {
  const router = useRouter();
  const { group, role, groupId, membership } = useActiveGroup();
  const { loading } = useGroups();
  const { member } = useAuth();

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
      header={<DashboardHeader group={group} member={member} roleLabel={ROLE_LABEL[role]} />}
      bottomBar={role === 'owner' ? <OrganizerNav /> : role === 'member' ? <MemberNav /> : undefined}
    >
      {role === 'owner' && <OwnerDashboard groupId={groupId!} />}
      {role === 'treasurer' && <TreasurerDashboard groupId={groupId!} />}
      {role === 'auditor' && <AuditorDashboard groupId={groupId!} />}
      {role === 'member' && <MemberDashboard groupId={groupId!} />}
    </DashboardShell>
  );
}
