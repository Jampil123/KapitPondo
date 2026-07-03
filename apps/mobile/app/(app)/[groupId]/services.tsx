/**
 * app/(app)/[groupId]/services.tsx — placeholder. Reached from DashboardNav's
 * "Services" tab. Not built yet.
 */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Grid3x3 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';

export default function Services() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Services" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
        <Grid3x3 size={40} color={semantic.textMuted} />
        <Text variant="h3" style={{ fontSize: 16 }}>Coming soon</Text>
        <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
          Additional services aren't available yet.
        </Text>
      </View>
    </SafeAreaView>
  );
}
