/**
 * app/(app)/[groupId]/penalties.tsx
 * ----------------------------------------------------------------------------
 * Penalties review. The designer's layout exists, but there is NO penalties API
 * yet (M5.4 auto-penalty was never built server-side), so there's no data to
 * show or waive. Rather than fake it, this renders the shell with an honest
 * "not enabled yet" state. When the backend adds penalties endpoints, wire:
 *   list → GET penalties · waive/uphold → PATCH penalty status.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';

type Tab = 'active' | 'waived';

export default function Penalties() {
  const [tab, setTab] = useState<Tab>('active');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Penalties Review" subtitle="Organizer" />
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: semantic.surfaceAlt, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" color="secondary">Penalties this cycle</Text>
            <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>₱0.00</Text>
          </View>
          <AlertTriangle size={22} color="#A87C2C" />
        </View>

        <Segmented<Tab>
          options={[{ key: 'active', label: 'Active' }, { key: 'waived', label: 'Waived' }]}
          value={tab}
          onChange={setTab}
        />

        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={26} color={semantic.textMuted} />
          </View>
          <Text variant="h3" style={{ fontSize: 16 }}>Penalty tracking isn't enabled yet</Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            Late-contribution penalties (M5.4) will appear here once the server side is added. Until then there's nothing to review or waive.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
