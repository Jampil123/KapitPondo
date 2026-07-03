/**
 * features/dashboard/AuditorDashboard.tsx
 * ----------------------------------------------------------------------------
 * Placeholder — the Auditor role dashboard hasn't been built out yet.
 * Rendered inside DashboardShell, same as the other role dashboards.
 */
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';

export function AuditorDashboard({ groupId }: { groupId: string }) {
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
      <Text variant="body" color="muted">Auditor dashboard coming soon.</Text>
    </View>
  );
}
