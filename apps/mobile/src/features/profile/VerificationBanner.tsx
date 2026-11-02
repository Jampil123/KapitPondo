import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { shadowToken, intent, verifiedGreen } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { VERIFY_META, verifyDestination } from '@/constants/verificationStatus';

/** The member's identity verification state — what it unlocks, and the next step if there is one. Shown on Personal Information. */
export function VerificationBanner({ style }: { style?: object }) {
  const router = useRouter();
  const { member } = useAuth();
  const status = member?.verification_status ?? 'unverified';
  const vmeta = VERIFY_META[status] ?? VERIFY_META.unverified;
  // Verified uses the app's verified green (same as the Profile badge); other states keep their intent colors.
  const vtone = status === 'verified'
    ? { soft: verifiedGreen.soft, strong: verifiedGreen.base, text: verifiedGreen.text }
    : intent[vmeta.tone];

  return (
    <View style={[{ backgroundColor: vtone.soft, borderRadius: 18, padding: 16 }, shadowToken.card, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: vtone.strong, alignItems: 'center', justifyContent: 'center' }}>
          <vmeta.icon size={16} color="#fff" strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: vtone.text }}>{vmeta.title}</Text>
          <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{vmeta.subtitle(member?.verification_rejection_reason ?? null)}</Text>
        </View>
      </View>

      {vmeta.unlocks ? (
        <View style={{ marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(30,58,71,0.09)', gap: 7 }}>
          {['Request a loan', 'Create your own group', 'Be appointed Treasurer or Auditor'].map((u) => (
            <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Lock size={13} color={intent.warning.text} />
              <Text variant="caption" color="secondary">{u}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {vmeta.btn ? (
        <Button label={vmeta.btn} onPress={() => router.push(verifyDestination(status) as any)} style={{ marginTop: 13 }} />
      ) : null}
    </View>
  );
}
