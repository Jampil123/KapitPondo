import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mail, ChevronDown, ShieldCheck, Phone } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { AddressPickerSheet } from '@/components/ui/AddressPickerSheet';
import { PickerSheet } from '@/components/shared/PickerSheet';
import { VerificationStepHeader } from '@/components/shared/VerificationStepHeader';
import { semantic, shadowToken } from '@/theme/colors';
import { uploadImage, readImageBase64 } from '@/lib/upload';
import { submitIdentity, extractIdFields } from '@/api/members';
import { idTypeLabel } from '@/constants/idTypes';
import { SOURCE_OF_FUNDS, sourceOfFundsLabel } from '@/constants/sourceOfFunds';
import { EMPLOYMENT_STATUSES, employmentStatusLabel } from '@/constants/employmentStatus';
import { searchProvinces, searchCities, searchBarangays } from '@/constants/phAddress';
import { SEX_OPTIONS, sexLabel } from '@/constants/sex';
import { useAuth } from '@/context/AuthContext';
import { formatPH } from '@/lib/phone';

// Steps 1 (capture ID) and 2 (selfie) live on their own screens —
// identity-capture.tsx and selfie-capture.tsx — not here; see the
// mount-time redirect gate below for why this screen only ever renders
// steps 3-4 itself.
const STEP_TITLES = ['Capture your ID', 'Take a Selfie', 'Confirm your Info', 'Review & Submit'];
const DRAFT_KEY = 'identity_draft_v1';

type IdentityDraft = {
  step: number;
  idType: string | null;
  idImageUri: string | null;
  selfieUri: string | null;
  firstName: string; middleName: string; lastName: string; birthday: string;
  sex: string | null; idNumber: string;
  nationality: string; email: string;
  province: string; city: string; barangay: string;
  streetAddress: string; zipCode: string;
  sourceOfFunds: string | null; employmentStatus: string | null; occupation: string;
};

function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" style={{ fontSize: 13, marginBottom: 10 }}>{children}</Text>;
}

export default function Identity() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, member } = useAuth();
  const meta = (session?.user?.user_metadata ?? {}) as Record<string, string | undefined>;

  const [step, setStep] = useState(1);

  // Step 1 (captured on identity-capture.tsx, not here — see the redirect
  // gate below; idType/idImageUri are still read from the shared draft)
  const [idType, setIdType] = useState<string | null>(null);
  const [idImageUri, setIdImageUri] = useState<string | null>(null);

  // Step 2
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  // Step 3 — personal info
  const [firstName, setFirstName] = useState(meta.first_name ?? '');
  const [middleName, setMiddleName] = useState(meta.middle_name ?? '');
  const [lastName, setLastName] = useState(meta.last_name ?? '');
  const [birthday, setBirthday] = useState(meta.birthday ?? '');
  const [sex, setSex] = useState<string | null>(null);
  const [sexPickerOpen, setSexPickerOpen] = useState(false);
  const [idNumber, setIdNumber] = useState('');
  const [nationality, setNationality] = useState('Filipino');
  const [email, setEmail] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [barangay, setBarangay] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [provincePickerOpen, setProvincePickerOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [barangayPickerOpen, setBarangayPickerOpen] = useState(false);

  // Auto-fill from the ID photo — runs once per captured front photo (see
  // the effect below), never overwrites a field the member already has a
  // value in. Purely advisory (see gemini.js's ID_STRUCTURE_PROMPT): the
  // member reviews/edits every field before submitting either way.
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [ocrAttemptedFor, setOcrAttemptedFor] = useState<string | null>(null);
  const [sourceOfFunds, setSourceOfFunds] = useState<string | null>(null);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState<string | null>(null);
  const [employmentPickerOpen, setEmploymentPickerOpen] = useState(false);
  const [occupation, setOccupation] = useState('');

  // Step 4
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Consent is deliberately NOT persisted — always re-check the box on a restored draft.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d: Partial<IdentityDraft> = JSON.parse(raw);
          if (d.step) setStep(d.step);
          if (d.idType !== undefined) setIdType(d.idType);
          if (d.idImageUri !== undefined) setIdImageUri(d.idImageUri);
          if (d.selfieUri !== undefined) setSelfieUri(d.selfieUri);
          if (d.firstName !== undefined) setFirstName(d.firstName);
          if (d.middleName !== undefined) setMiddleName(d.middleName);
          if (d.lastName !== undefined) setLastName(d.lastName);
          if (d.birthday !== undefined) setBirthday(d.birthday);
          if (d.sex !== undefined) setSex(d.sex);
          if (d.idNumber !== undefined) setIdNumber(d.idNumber);
          if (d.nationality !== undefined) setNationality(d.nationality);
          if (d.email !== undefined) setEmail(d.email);
          if (d.province !== undefined) setProvince(d.province);
          if (d.city !== undefined) setCity(d.city);
          if (d.barangay !== undefined) setBarangay(d.barangay);
          if (d.streetAddress !== undefined) setStreetAddress(d.streetAddress);
          if (d.zipCode !== undefined) setZipCode(d.zipCode);
          if (d.sourceOfFunds !== undefined) setSourceOfFunds(d.sourceOfFunds);
          if (d.employmentStatus !== undefined) setEmploymentStatus(d.employmentStatus);
          if (d.occupation !== undefined) setOccupation(d.occupation);
        }
      } catch {
        // Corrupt/unreadable draft — just start fresh.
      } finally {
        setHydrated(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // identity-capture.tsx and selfie-capture.tsx (the dedicated capture
  // flows) write their shots straight into this same draft rather than
  // returning them as route params — the camera hand-off can kill/relaunch
  // the app mid-capture (see the DRAFT_KEY comment above), which would lose
  // in-flight params but not an already-persisted draft. Re-reading here on
  // focus is what actually picks those shots up when the user returns from
  // one of those screens.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(DRAFT_KEY);
          if (!raw) return;
          const d: Partial<IdentityDraft> = JSON.parse(raw);
          if (d.idImageUri !== undefined) setIdImageUri(d.idImageUri);
          if (d.selfieUri !== undefined) setSelfieUri(d.selfieUri);
        } catch {
          // Best-effort — the mount-time hydration above already covers the normal case.
        }
      })();
    }, []),
  );

  // Mirror progress to disk so a forced reload (see the comment on DRAFT_KEY
  // above) resumes instead of starting over. Lightly debounced since this
  // fires on every keystroke across the whole form.
  useEffect(() => {
    if (!hydrated) return;
    const draft: IdentityDraft = {
      step, idType, idImageUri, selfieUri,
      firstName, middleName, lastName, birthday, sex, idNumber, nationality, email,
      province, city, barangay, streetAddress, zipCode,
      sourceOfFunds, employmentStatus, occupation,
    };
    const t = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [
    hydrated, step, idType, idImageUri, selfieUri,
    firstName, middleName, lastName, birthday, sex, idNumber, nationality, email,
    province, city, barangay, streetAddress, zipCode,
    sourceOfFunds, employmentStatus, occupation,
  ]);

  // Auto-fill personal info from the ID front photo as soon as step 3 is
  // reached. Only fires once per captured photo (ocrAttemptedFor guards
  // against re-running on every step revisit, but re-runs if the member
  // retakes the front photo). Only fills fields that are still empty —
  // never overwrites something the member already typed or already
  // auto-filled and then edited.
  useEffect(() => {
    if (step !== 3 || !idImageUri || ocrAttemptedFor === idImageUri) return;
    setOcrAttemptedFor(idImageUri);
    setOcrStatus('scanning');
    (async () => {
      try {
        const { base64, mediaType } = await readImageBase64(idImageUri);
        const fields = await extractIdFields(base64, mediaType);
        if (!firstName && fields.first_name) setFirstName(fields.first_name);
        if (!middleName && fields.middle_name) setMiddleName(fields.middle_name);
        if (!lastName && fields.last_name) setLastName(fields.last_name);
        if (!birthday && fields.birthday) setBirthday(fields.birthday);
        if (!sex && fields.sex) setSex(fields.sex);
        if (!idNumber && fields.id_number) setIdNumber(fields.id_number);
        if (!nationality && fields.nationality) setNationality(fields.nationality);
        if (!province && fields.province) setProvince(fields.province);
        if (!city && fields.city) setCity(fields.city);
        if (!barangay && fields.barangay) setBarangay(fields.barangay);
        if (!streetAddress && fields.street_address) setStreetAddress(fields.street_address);
        setOcrStatus('done');
      } catch (e) {
        // Swallowed from the member's point of view (this is an unattended,
        // best-effort scan) — logged so a real failure (bad endpoint, model
        // error, timeout) is diagnosable instead of just "didn't work".
        console.warn('[identity] ID auto-fill failed:', (e as Error).message ?? e);
        setOcrStatus('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, idImageUri, ocrAttemptedFor]);

  // This screen only ever renders steps 3-4 (personal info, review) — ID and
  // selfie capture happen on their own screens before this one is ever
  // reached in the normal flow. If someone still lands here without a photo
  // (a deep link, an old "Verify now" caller we missed, backing out mid-
  // capture and returning), send them to whichever capture step is missing
  // instead of showing a blank screen. Never forces `step` down — see
  // bumpStepAtLeast in selfie-capture.tsx for why a Review-triggered retake
  // must come back to Review, not restart at personal info.
  useEffect(() => {
    if (!hydrated) return;
    if (!idImageUri) {
      router.replace('/(app)/identity-capture' as any);
    } else if (!selfieUri) {
      router.replace('/(app)/selfie-capture' as any);
    } else if (step < 3) {
      setStep(3);
    }
  }, [hydrated, idImageUri, selfieUri, step, router]);

  const canNext3 =
    !!firstName.trim() && !!lastName.trim() && !!birthday.trim() && !!sex && !!idNumber.trim() && !!nationality.trim() &&
    !!province.trim() && !!city.trim() && !!barangay.trim() && !!streetAddress.trim() && !!zipCode.trim() &&
    !!sourceOfFunds && !!employmentStatus;
  const canSubmit = agreed;

  // Step 3 stays hidden behind a loading screen until the ID scan for this
  // photo has actually finished (or the member retook the photo, which
  // starts a fresh scan) — see the auto-fill effect above.
  const ocrLoading = !!idImageUri && (ocrAttemptedFor !== idImageUri || ocrStatus === 'scanning');

  async function onSubmit() {
    if (!idImageUri || !selfieUri || !idType || !canNext3 || !canSubmit) return;
    setLoading(true);
    try {
      const idFrontPath = await uploadImage('id-documents', idImageUri, 'kyc');
      const selfiePath = await uploadImage('id-documents', selfieUri, 'selfie');
      await submitIdentity({
        id_document_url: idFrontPath,
        selfie_url: selfiePath,
        id_type: idType,
        email: email.trim() || undefined,
        first_name: firstName.trim(),
        middle_name: middleName.trim() || undefined,
        last_name: lastName.trim(),
        birthday: birthday.trim(),
        sex: sex ?? undefined,
        id_number: idNumber.trim(),
        nationality: nationality.trim(),
        province: province.trim(),
        city: city.trim(),
        barangay: barangay.trim(),
        street_address: streetAddress.trim(),
        zip_code: zipCode.trim(),
        source_of_funds: sourceOfFunds ?? undefined,
        employment_status: employmentStatus ?? undefined,
        occupation: occupation.trim() || undefined,
      });
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      router.replace('/(app)/pending' as any);
    } catch (e) {
      Alert.alert('Submission failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Also covers the brief window before the redirect gate above sends an
  // incomplete draft to identity-capture/selfie-capture — otherwise steps
  // 3-4 would flash empty (there's no step 1/2 UI here to fall back to).
  if (!hydrated || !idImageUri || !selfieUri) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={semantic.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <VerificationStepHeader
        title={STEP_TITLES[step - 1]}
        step={step}
        totalSteps={4}
        onBack={() => (step === 4 ? setStep(3) : router.replace('/(app)/selfie-capture' as any))}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        {step === 3 && ocrLoading && (
          <View style={{ paddingVertical: 100, alignItems: 'center', gap: 14 }}>
            <ActivityIndicator color={semantic.brand} />
            <Text variant="body" color="secondary">Scanning your ID for details…</Text>
          </View>
        )}

        {step === 3 && !ocrLoading && (
          <>
            <SectionLabel>Personal Information</SectionLabel>
            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="First Name" placeholder="Juan" value={firstName} onChangeText={setFirstName} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Last Name" placeholder="Dela Cruz" value={lastName} onChangeText={setLastName} />
                </View>
              </View>
              <Field label="Middle Name (Optional)" placeholder="Santos" value={middleName} onChangeText={setMiddleName} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Birthday"
                    placeholder="MM/DD/YYYY"
                    keyboardType="numbers-and-punctuation"
                    value={birthday}
                    onChangeText={setBirthday}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Sex</Text>
                  <Pressable
                    onPress={() => setSexPickerOpen(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                      paddingVertical: 14, paddingHorizontal: 14, marginBottom: 15,
                    }}
                  >
                    <Text variant="body" style={{ flex: 1, color: sex ? semantic.textPrimary : semantic.textMuted }}>
                      {sex ? sexLabel(sex) : 'Select'}
                    </Text>
                    <ChevronDown size={18} color={semantic.textMuted} />
                  </Pressable>
                </View>
              </View>
              <Field label="ID Number" placeholder="1234-5678-9012-3456" value={idNumber} onChangeText={setIdNumber} />
              <Field label="Nationality" placeholder="Filipino" value={nationality} onChangeText={setNationality} />
            </View>

            <SectionLabel>Contact Information</SectionLabel>
            <View style={{ marginBottom: 18, gap: 4 }}>
              <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Mobile Number</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Phone size={16} color={semantic.textMuted} />
                <Text variant="body">{member?.phone ? formatPH(member.phone) : '—'}</Text>
                <Text variant="caption" color="secondary">(verified)</Text>
              </View>
              <Field
                label="Email Address (Optional)"
                placeholder="name@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                leading={<Mail size={18} color={semantic.textMuted} />}
              />
            </View>

            <SectionLabel>Residential Address</SectionLabel>
            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Province</Text>
                  <Pressable
                    onPress={() => setProvincePickerOpen(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                      paddingVertical: 14, paddingHorizontal: 14, marginBottom: 15,
                    }}
                  >
                    <Text variant="body" numberOfLines={1} style={{ flex: 1, color: province ? semantic.textPrimary : semantic.textMuted }}>
                      {province || 'Select'}
                    </Text>
                    <ChevronDown size={18} color={semantic.textMuted} />
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>City / Municipality</Text>
                  <Pressable
                    onPress={() => province && setCityPickerOpen(true)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                      paddingVertical: 14, paddingHorizontal: 14, marginBottom: 15,
                      opacity: province ? 1 : 0.55,
                    }}
                  >
                    <Text variant="body" numberOfLines={1} style={{ flex: 1, color: city ? semantic.textPrimary : semantic.textMuted }}>
                      {city || (province ? 'Select' : 'Pick a province first')}
                    </Text>
                    <ChevronDown size={18} color={semantic.textMuted} />
                  </Pressable>
                </View>
              </View>

              <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Barangay</Text>
              <Pressable
                onPress={() => city && setBarangayPickerOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                  paddingVertical: 14, paddingHorizontal: 14, marginBottom: 15,
                  opacity: city ? 1 : 0.55,
                }}
              >
                <Text variant="body" style={{ flex: 1, color: barangay ? semantic.textPrimary : semantic.textMuted }}>
                  {barangay || (city ? 'Select barangay' : 'Pick a city/municipality first')}
                </Text>
                <ChevronDown size={18} color={semantic.textMuted} />
              </Pressable>

              <Field label="Street Address" placeholder="House No., Street, Subdivision" value={streetAddress} onChangeText={setStreetAddress} />
              <Field label="Zip Code" placeholder="4027" keyboardType="numbers-and-punctuation" value={zipCode} onChangeText={setZipCode} />
            </View>

            <SectionLabel>Financial Information</SectionLabel>
            <View style={{ marginBottom: 18 }}>
              <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Source of Funds</Text>
              <Pressable
                onPress={() => setSourcePickerOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                  paddingVertical: 14, paddingHorizontal: 14, marginBottom: 15,
                }}
              >
                <Text variant="body" style={{ flex: 1, color: sourceOfFunds ? semantic.textPrimary : semantic.textMuted }}>
                  {sourceOfFunds ? sourceOfFundsLabel(sourceOfFunds) : 'Select source of funds'}
                </Text>
                <ChevronDown size={18} color={semantic.textMuted} />
              </Pressable>

              <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Employment Status</Text>
              <Pressable
                onPress={() => setEmploymentPickerOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                  paddingVertical: 14, paddingHorizontal: 14, marginBottom: 15,
                }}
              >
                <Text variant="body" style={{ flex: 1, color: employmentStatus ? semantic.textPrimary : semantic.textMuted }}>
                  {employmentStatus ? employmentStatusLabel(employmentStatus) : 'Select employment status'}
                </Text>
                <ChevronDown size={18} color={semantic.textMuted} />
              </Pressable>

              <Field label="Occupation / Job Title (Optional)" placeholder="e.g. Sari-sari store owner" value={occupation} onChangeText={setOccupation} />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Back" variant="ghost" onPress={() => router.replace('/(app)/selfie-capture' as any)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Next" onPress={() => setStep(4)} disabled={!canNext3} />
              </View>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <View style={{ marginBottom: 18 }}>
              <Text variant="body" color="secondary">
                Confirm your details below before submitting for review.
              </Text>
            </View>

            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18, gap: 14 }, shadowToken.card]}>
              <View>
                <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>ID Type</Text>
                <Text variant="body">{idTypeLabel(idType)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>ID Photo</Text>
                    <Pressable onPress={() => router.replace('/(app)/identity-capture' as any)}>
                      <Text variant="caption" color="brand" style={{ fontWeight: '600' }}>Retake</Text>
                    </Pressable>
                  </View>
                  {idImageUri ? <Image source={{ uri: idImageUri }} style={{ width: '100%', height: 90, borderRadius: 10 }} resizeMode="cover" /> : null}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Selfie</Text>
                    <Pressable onPress={() => router.replace('/(app)/selfie-capture' as any)}>
                      <Text variant="caption" color="brand" style={{ fontWeight: '600' }}>Retake</Text>
                    </Pressable>
                  </View>
                  {selfieUri ? <Image source={{ uri: selfieUri }} style={{ width: '100%', height: 90, borderRadius: 10 }} resizeMode="cover" /> : null}
                </View>
              </View>
            </View>

            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18, gap: 10 }, shadowToken.card]}>
              <View>
                <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Full Name</Text>
                <Text variant="body">{[firstName, middleName, lastName].filter(Boolean).join(' ')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Birthday</Text>
                  <Text variant="body">{birthday || '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Sex</Text>
                  <Text variant="body">{sexLabel(sex)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>ID Number</Text>
                  <Text variant="body">{idNumber || '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Nationality</Text>
                  <Text variant="body">{nationality || '—'}</Text>
                </View>
              </View>
              <View>
                <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Address</Text>
                <Text variant="body">{[streetAddress, barangay, city, province].filter(Boolean).join(', ')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Source of Funds</Text>
                  <Text variant="body">{sourceOfFundsLabel(sourceOfFunds)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Employment</Text>
                  <Text variant="body">{employmentStatusLabel(employmentStatus)}</Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <ShieldCheck size={18} color={semantic.brandDark} />
              <Text variant="label" style={{ fontSize: 13 }}>Privacy</Text>
            </View>
            <View style={{ marginBottom: 22 }}>
              <Checkbox
                checked={agreed}
                onToggle={() => setAgreed((a) => !a)}
                label="I agree to KapitPondo's Privacy Policy on identity verification and consent to my ID, selfie, and personal information being used to verify my identity."
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Back" variant="ghost" onPress={() => setStep(3)} disabled={loading} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Submit Identity" onPress={onSubmit} loading={loading} disabled={!canSubmit} />
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <PickerSheet
        visible={sexPickerOpen}
        title="Select sex"
        options={SEX_OPTIONS}
        selected={sex}
        onSelect={(v) => { setSex(v); setSexPickerOpen(false); }}
        onClose={() => setSexPickerOpen(false)}
        insets={insets}
      />
      <PickerSheet
        visible={sourcePickerOpen}
        title="Select source of funds"
        options={SOURCE_OF_FUNDS}
        selected={sourceOfFunds}
        onSelect={(v) => { setSourceOfFunds(v); setSourcePickerOpen(false); }}
        onClose={() => setSourcePickerOpen(false)}
        insets={insets}
      />
      <PickerSheet
        visible={employmentPickerOpen}
        title="Select employment status"
        options={EMPLOYMENT_STATUSES}
        selected={employmentStatus}
        onSelect={(v) => { setEmploymentStatus(v); setEmploymentPickerOpen(false); }}
        onClose={() => setEmploymentPickerOpen(false)}
        insets={insets}
      />
      <AddressPickerSheet
        visible={provincePickerOpen}
        title="Select province"
        getOptions={searchProvinces}
        selected={province}
        onSelect={(v) => { setProvince(v); setCity(''); setBarangay(''); setProvincePickerOpen(false); }}
        onClose={() => setProvincePickerOpen(false)}
        insets={insets}
      />
      <AddressPickerSheet
        visible={cityPickerOpen}
        title="Select city / municipality"
        getOptions={(q) => searchCities(province, q)}
        selected={city}
        onSelect={(v) => { setCity(v); setBarangay(''); setCityPickerOpen(false); }}
        onClose={() => setCityPickerOpen(false)}
        insets={insets}
      />
      <AddressPickerSheet
        visible={barangayPickerOpen}
        title="Select barangay"
        getOptions={(q) => searchBarangays(city, q)}
        selected={barangay}
        onSelect={(v) => { setBarangay(v); setBarangayPickerOpen(false); }}
        onClose={() => setBarangayPickerOpen(false)}
        insets={insets}
      />
    </SafeAreaView>
  );
}
