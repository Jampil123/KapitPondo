import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic } from '@/theme/colors';
import { formatPH } from '@/lib/phone';
import { idTypeLabel } from '@/constants/idTypes';
import { VERIFY_META } from '@/constants/verificationStatus';
import { useAuth } from '@/context/AuthContext';

const BAND_TOP = '#4C7C90';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

function maskIdNumber(idNumber: string | null): string {
  if (!idNumber) return '—';
  const digits = idNumber.trim();
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ paddingVertical: 10 }}>
      <Text variant="caption" color="muted">{label}</Text>
      <Text variant="body" style={{ marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function LinkRow({ label, sub, onPress }: { label: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 }}>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 13.5 }}>{label}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text>
      </View>
      <ChevronRight size={18} color={semantic.textMuted} />
    </Pressable>
  );
}

export default function MyDataConsent() {
  const router = useRouter();
  const { member } = useAuth();

  const hasAddress = !!(member?.province || member?.city || member?.street_address);
  const consentGiven = !!(member?.consent_version && member?.consent_accepted_at);
  const vmeta = VERIFY_META[member?.verification_status ?? 'unverified'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="My Data & Consent" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>Your consent</Text>
        <View style={{ paddingVertical: 10, marginBottom: 12 }}>
          <Text variant="body" color="secondary" style={{ lineHeight: 20 }}>
            {consentGiven
              ? `You agreed to KapitPondo's Terms of Service and Privacy Policy (version ${member!.consent_version}) on ${formatDate(member!.consent_accepted_at)}.`
              : "We don't have a recorded consent date for this account yet — this can happen for accounts created before consent tracking was added."}
          </Text>
        </View>

        <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>Personal information</Text>
        <View style={{ marginBottom: 12 }}>
          <Field label="Full name" value={member?.full_name ?? '—'} />
          <View style={{ borderTopWidth: 1, borderTopColor: semantic.border }}>
            <Field label="Birthday" value={member?.birthday ?? '—'} />
          </View>
          {member?.sex ? (
            <View style={{ borderTopWidth: 1, borderTopColor: semantic.border }}>
              <Field label="Sex" value={member.sex} />
            </View>
          ) : null}
          {member?.nationality ? (
            <View style={{ borderTopWidth: 1, borderTopColor: semantic.border }}>
              <Field label="Nationality" value={member.nationality} />
            </View>
          ) : null}
        </View>

        <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>Contact information</Text>
        <View style={{ marginBottom: 12 }}>
          <Field label="Mobile number" value={member?.phone ? formatPH(member.phone) : '—'} />
          <View style={{ borderTopWidth: 1, borderTopColor: semantic.border }}>
            <Field label="Email" value={member?.email || 'Not set'} />
          </View>
        </View>

        <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>Address</Text>
        <View style={{ marginBottom: 12 }}>
          {hasAddress ? (
            <Field
              label="Residential address"
              value={[member?.street_address, member?.barangay, member?.city, member?.province, member?.zip_code].filter(Boolean).join(', ')}
            />
          ) : (
            <Text variant="body" color="secondary" style={{ paddingVertical: 10 }}>Not submitted yet.</Text>
          )}
        </View>

        <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>Identity documents</Text>
        <View style={{ marginBottom: 4 }}>
          <Field label="Document type" value={idTypeLabel(member?.id_type)} />
          <View style={{ borderTopWidth: 1, borderTopColor: semantic.border }}>
            <Field label="ID number" value={maskIdNumber(member?.id_number ?? null)} />
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: semantic.border }}>
            <Field label="Verification status" value={vmeta.title} />
          </View>
        </View>
        <LinkRow label="My Submission" sub="View your submitted ID photo and selfie" onPress={() => router.push('/(app)/my-submission' as any)} />
        <View style={{ borderTopWidth: 1, borderTopColor: semantic.border }}>
          <LinkRow label="Privacy Policy" sub="How your information is collected and used" onPress={() => router.push('/(app)/privacy-policy' as any)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
