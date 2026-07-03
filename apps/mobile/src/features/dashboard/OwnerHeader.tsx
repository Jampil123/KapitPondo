/**
 * features/dashboard/OwnerHeader.tsx
 * ----------------------------------------------------------------------------
 * Thin wrapper over the shared DashboardHeader with the Organizer label.
 * Kept so existing imports keep working; new dashboards should use
 * <DashboardHeader roleLabel="Treasurer" /> etc. directly.
 */
import { DashboardHeader } from '@/components/shared/DashboardHeader';
import type { Group } from '@/api/groups';
import type { Member } from '@/api/members';

export function OwnerHeader({ group, member }: { group: Group | null; member: Member | null }) {
  return <DashboardHeader group={group} member={member} roleLabel="Organizer" />;
}
