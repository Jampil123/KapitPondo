/**
 * app/(app)/[groupId]/chat.tsx — placeholder. Reached from DashboardNav's
 * "Chat" tab. Group messaging isn't built yet.
 */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';

export default function Chat() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Chat" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
        <MessageCircle size={40} color={semantic.textMuted} />
        <Text variant="h3" style={{ fontSize: 16 }}>Coming soon</Text>
        <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
          Group chat isn't available yet.
        </Text>
      </View>
    </SafeAreaView>
  );
}
