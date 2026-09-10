/**
 * app/(app)/my-submission.tsx — read-only view of what the member submitted
 * for identity verification. Reached from Profile's "View what I submitted"
 * (shown while status is pending). Pulls straight from GET /api/me/profile —
 * the same signed-URL exchange the admin console uses for the ID/selfie
 * photos — rather than local wizard state, so it reflects what's actually on
 * file even after the app was closed and reopened.
 */
import { useEffect, useState } from 'react';
import { View, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Phone } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { getMyProfile, type Member } from '@/api/members';
import { idTypeLabel } from '@/constants/idTypes';
import { sourceOfFundsLabel } from '@/constants/sourceOfFunds';
import { employmentStatusLabel } from '@/constants/employmentStatus';
import { formatPH } from '@/lib/phone';

function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" style={{ fontSize: 13, marginBottom: 10, marginTop: 22 }}>{children}</Text>;
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <View>
      <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>{label}</Text>
      <Text variant="body">{value || '—'}</Text>
    </View>
  );
}

function Photo({ uri }: { uri?: string | null }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: '100%', height: 100, borderRadius: 10 }} resizeMode="cover" />
  ) : (
    <View style={{ width: '100%', height: 100, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="caption" color="muted">Not available</Text>
    </View>
  );
}

export default function MySubmission() {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setMember(await getMyProfile());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={semantic.brand} />
      </SafeAreaView>
    );
  }

  if (error || !member) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
        <ScreenHeader back />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            {error ?? "Couldn't load your submission."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusMeta = getStatusMeta('verification', member.verification_status);
  const tone = intent[statusMeta.intent];
  const fullName = [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40 }}>
        <Text variant="h1" style={{ fontSize: 21, marginBottom: 4 }}>My Submission</Text>
        <Text variant="body" color="secondary" style={{ marginBottom: 16 }}>
          What you submitted for identity verification.
        </Text>

        <View style={{ backgroundColor: tone.soft, borderRadius: 14, padding: 14 }}>
          <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: tone.text }}>{statusMeta.label}</Text>
          {member.verification_status === 'rejected' && member.verification_rejection_reason ? (
            <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>{member.verification_rejection_reason}</Text>
          ) : null}
        </View>

        <SectionLabel>Identity Document</SectionLabel>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 14 }, shadowToken.card]}>
          <InfoField label="ID Type" value={idTypeLabel(member.id_type)} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Front</Text>
              <Photo uri={member.id_document_signed_url} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Back</Text>
              <Photo uri={member.id_document_back_signed_url} />
              <Text variant="caption" color="secondary">
                {member.id_document_qr_data ? 'QR code captured' : 'No QR code detected'}
              </Text>
            </View>
          </View>
          <View>
            <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 6 }}>Selfie</Text>
            {member.selfie_signed_url ? (
              <Image source={{ uri: member.selfie_signed_url }} style={{ width: 110, height: 110, borderRadius: 55 }} resizeMode="cover" />
            ) : (
              <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="caption" color="muted">Not available</Text>
              </View>
            )}
          </View>
        </View>

        <SectionLabel>Personal Information</SectionLabel>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }, shadowToken.card]}>
          <InfoField label="Full Name" value={fullName} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><InfoField label="Birthday" value={member.birthday} /></View>
            <View style={{ flex: 1 }}><InfoField label="Nationality" value={member.nationality} /></View>
          </View>
        </View>

        <SectionLabel>Contact Information</SectionLabel>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 4 }, shadowToken.card]}>
          <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Mobile Number</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Phone size={16} color={semantic.textMuted} />
            <Text variant="body">{member.phone ? formatPH(member.phone) : '—'}</Text>
          </View>
          <InfoField label="Email Address" value={member.email} />
        </View>

        <SectionLabel>Residential Address</SectionLabel>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><InfoField label="Province" value={member.province} /></View>
            <View style={{ flex: 1 }}><InfoField label="City / Municipality" value={member.city} /></View>
          </View>
          <InfoField label="Barangay" value={member.barangay} />
          <InfoField label="Street Address" value={member.street_address} />
          <InfoField label="Zip Code" value={member.zip_code} />
        </View>

        <SectionLabel>Financial Information</SectionLabel>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 12 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><InfoField label="Source of Funds" value={sourceOfFundsLabel(member.source_of_funds)} /></View>
            <View style={{ flex: 1 }}><InfoField label="Employment" value={employmentStatusLabel(member.employment_status)} /></View>
          </View>
          <InfoField label="Occupation" value={member.occupation} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
