import { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Smartphone } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { listLoginActivity, type LoginActivityEntry } from '@/api/loginActivity';

const BAND_TOP = '#4C7C90';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LoginActivity() {
  const [entries, setEntries] = useState<LoginActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setEntries(await listLoginActivity());
      } catch (e) {
        setError((e as Error).message || "Couldn't load your login activity.");
      }
    })();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Login Activity" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <Text variant="body" color="secondary" style={{ marginBottom: 18 }}>
          Devices and times your account has signed in. If something here looks unfamiliar, change your password right away.
        </Text>

        {error ? (
          <Text variant="caption" style={{ color: intent.danger.text }}>{error}</Text>
        ) : entries === null ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : entries.length === 0 ? (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 20 }}>
            No login activity recorded yet.
          </Text>
        ) : (
          entries.map((e, i) => (
            <View
              key={e.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 14,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: semantic.border,
              }}
            >
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Smartphone size={16} color={semantic.brandDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ fontSize: 13.5 }}>{e.device_label ?? 'Unknown device'}</Text>
                <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{relativeTime(e.created_at)}</Text>
              </View>
              {i === 0 ? (
                <View style={{ backgroundColor: intent.success.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>Most recent</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
