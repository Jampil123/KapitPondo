import { View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { semantic } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: semantic.background,
          padding: spacing['3xl'],
          gap: spacing.sm,
        }}
      >
        <Text variant="h2">This screen doesn’t exist</Text>
        <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
          The page you’re looking for may have moved or never existed.
        </Text>

        <Link href="/" style={{ marginTop: spacing.lg }}>
          <Text variant="label" color="brand">
            Back to home
          </Text>
        </Link>
      </View>
    </>
  );
}
