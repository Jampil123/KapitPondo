import { useEffect, useState } from 'react';
import { View, ScrollView, Image, ActivityIndicator, Modal, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { getMyProfile, type Member } from '@/api/members';
import { idTypeLabel } from '@/constants/idTypes';
import { sourceOfFundsLabel } from '@/constants/sourceOfFunds';
import { employmentStatusLabel } from '@/constants/employmentStatus';
import { VERIFY_META } from '@/constants/verificationStatus';
import { formatPH } from '@/lib/phone';

const BAND_TOP = '#4C7C90';

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

function Photo({ uri, onPress }: { uri?: string | null; onPress: () => void }) {
  return uri ? (
    <Pressable onPress={onPress}>
      <Image source={{ uri }} style={{ width: '100%', height: 100, borderRadius: 10 }} resizeMode="cover" />
    </Pressable>
  ) : (
    <View style={{ width: '100%', height: 100, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="caption" color="muted">Not available</Text>
    </View>
  );
}

export default function MySubmission() {
  const insets = useSafeAreaInsets();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

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
      <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
        <AppBar title="My Submission" backgroundColor={BAND_TOP} tintColor="#fff" />
        <View style={{ flex: 1, backgroundColor: semantic.background, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !member) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
        <AppBar title="My Submission" backgroundColor={BAND_TOP} tintColor="#fff" />
        <View style={{ flex: 1, backgroundColor: semantic.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            {error ?? "Couldn't load your submission."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const vmeta = VERIFY_META[member.verification_status] ?? VERIFY_META.unverified;
  const tone = intent[vmeta.tone];
  const statusMeta = getStatusMeta('verification', member.verification_status);
  // The shared "warning" intent reads as amber/gold everywhere else in the
  // app — for this one pill specifically, pending gets a clearer yellow so
  // the status is unambiguous at a glance. Nothing else in the card changes.
  const pillColors = member.verification_status === 'pending'
    ? { bg: '#FEF3C7', text: '#92400E' }
    : { bg: tone.soft, text: tone.text };
  const fullName = [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="My Submission" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: tone.soft }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center' }}>
              <vmeta.icon size={16} color={tone.text} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ fontSize: 13.5, color: tone.text }}>{vmeta.title}</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>
                {vmeta.subtitle(member.verification_rejection_reason ?? null)}
              </Text>
            </View>
            <View style={{ backgroundColor: pillColors.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: pillColors.text }}>{statusMeta.label}</Text>
            </View>
          </View>
        </View>

        <SectionLabel>Identity Document</SectionLabel>
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, gap: 14 }, shadowToken.card]}>
          <InfoField label="ID Type" value={idTypeLabel(member.id_type)} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>ID Photo</Text>
              <Photo uri={member.id_document_signed_url} onPress={() => setViewerUri(member.id_document_signed_url ?? null)} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Selfie</Text>
              <Photo uri={member.selfie_signed_url} onPress={() => setViewerUri(member.selfie_signed_url ?? null)} />
            </View>
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

      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setViewerUri(null)}
        >
          <Pressable
            onPress={() => setViewerUri(null)}
            hitSlop={10}
            style={{
              position: 'absolute', top: insets.top + 14, right: 20,
              width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} color="#fff" />
          </Pressable>
          {viewerUri ? (
            <Image source={{ uri: viewerUri }} style={{ width: '92%', height: '70%' }} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
