/**
 * app/(app)/identity.tsx — identity verification, a real 4-step wizard:
 *   1. Submit an ID         — ID type + ID photo (library upload)
 *   2. Take a Selfie        — front-camera photo (no video-liveness lib
 *                             installed; expo-image-picker's camera mode is
 *                             used instead)
 *   3. Personal Information — name/birthday, nationality, mobile (read-only,
 *                             already OTP-verified), email, residential
 *                             address (free-text per component — no PH
 *                             address/PSGC dataset installed), source of
 *                             funds, employment/occupation
 *   4. Review & Submit      — summary of everything, privacy-policy checkbox
 *
 * Lives under (app) — shown to an already signed-in, unverified user; must
 * not be under (auth) or the root auth-guard bounces it back to /(app)/groups.
 *
 * Deps: expo-image-picker (npx expo install expo-image-picker)
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Info, Check, Mail, ChevronDown, X, ShieldCheck, Phone } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Checkbox } from '@/components/ui/Checkbox';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { semantic, shadowToken } from '@/theme/colors';
import { uploadImage } from '@/lib/upload';
import { submitIdentity } from '@/api/members';
import { ID_TYPES, idTypeLabel } from '@/constants/idTypes';
import { SOURCE_OF_FUNDS, sourceOfFundsLabel } from '@/constants/sourceOfFunds';
import { EMPLOYMENT_STATUSES, employmentStatusLabel } from '@/constants/employmentStatus';
import { useAuth } from '@/context/AuthContext';
import { formatPH } from '@/lib/phone';

const STEP_LABELS = ['Submit an ID', 'Take a Selfie', 'Personal Information', 'Review & Submit'];

const ID_GUIDES = [
  'ID must be fully visible inside the frame',
  'Free from glare, blur or shadows',
  'Front side of the ID only',
  'All text and numbers are readable',
];

const SELFIE_GUIDES = [
  'Face the camera directly, in good lighting',
  'Remove sunglasses, masks, or hats',
  'Keep a neutral expression',
];

type PickerOption = { label: string; value: string };

function PickerSheet({
  visible, title, options, selected, onSelect, onClose, insets,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  insets: { bottom: number };
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="h3" style={{ flex: 1, fontSize: 17 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
          </View>
          <View style={{ gap: 8 }}>
            {options.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => onSelect(t.value)}
                style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: semantic.background, borderRadius: 14, padding: 14 }, shadowToken.card]}
              >
                <Text variant="label" style={{ flex: 1 }}>{t.label}</Text>
                {selected === t.value ? <Check size={18} color={semantic.brandDark} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" style={{ fontSize: 13, marginBottom: 10 }}>{children}</Text>;
}

export default function Identity() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, member } = useAuth();
  const meta = (session?.user?.user_metadata ?? {}) as Record<string, string | undefined>;

  const [step, setStep] = useState(1);

  // Step 1
  const [idType, setIdType] = useState<string | null>(null);
  const [idPickerOpen, setIdPickerOpen] = useState(false);
  const [idImageUri, setIdImageUri] = useState<string | null>(null);

  // Step 2
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  // Step 3 — personal info
  const [firstName, setFirstName] = useState(meta.first_name ?? '');
  const [middleName, setMiddleName] = useState(meta.middle_name ?? '');
  const [lastName, setLastName] = useState(meta.last_name ?? '');
  const [birthday, setBirthday] = useState(meta.birthday ?? '');
  const [nationality, setNationality] = useState('Filipino');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [barangay, setBarangay] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [sourceOfFunds, setSourceOfFunds] = useState<string | null>(null);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState<string | null>(null);
  const [employmentPickerOpen, setEmploymentPickerOpen] = useState(false);
  const [occupation, setOccupation] = useState('');

  // Step 4
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function pickIdImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload your ID.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) setIdImageUri(res.assets[0].uri);
  }

  async function takeSelfie() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a selfie.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      quality: 0.8,
    });
    if (!res.canceled) setSelfieUri(res.assets[0].uri);
  }

  const canNext1 = !!idType && !!idImageUri;
  const canNext2 = !!selfieUri;
  const canNext3 =
    !!firstName.trim() && !!lastName.trim() && !!nationality.trim() &&
    !!province.trim() && !!city.trim() && !!barangay.trim() && !!streetAddress.trim() &&
    !!sourceOfFunds && !!employmentStatus;
  const canSubmit = agreed;

  async function onSubmit() {
    if (!idImageUri || !selfieUri || !idType || !canNext3 || !canSubmit) return;
    setLoading(true);
    try {
      const idPath = await uploadImage('id-documents', idImageUri, 'kyc');
      const selfiePath = await uploadImage('id-documents', selfieUri, 'selfie');
      await submitIdentity({
        id_document_url: idPath,
        selfie_url: selfiePath,
        id_type: idType,
        email: email.trim() || undefined,
        first_name: firstName.trim(),
        middle_name: middleName.trim() || undefined,
        last_name: lastName.trim(),
        birthday: birthday.trim() || undefined,
        nationality: nationality.trim(),
        region: region.trim() || undefined,
        province: province.trim(),
        city: city.trim(),
        barangay: barangay.trim(),
        street_address: streetAddress.trim(),
        zip_code: zipCode.trim() || undefined,
        source_of_funds: sourceOfFunds ?? undefined,
        employment_status: employmentStatus ?? undefined,
        occupation: occupation.trim() || undefined,
      });
      router.replace('/(app)/pending' as any);
    } catch (e) {
      Alert.alert('Submission failed', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }}>
      <ScreenHeader back />
      <View style={{ paddingHorizontal: 22, marginBottom: 18 }}>
        <Stepper steps={STEP_LABELS} current={step} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        {step === 1 && (
          <>
            <View style={{ gap: 5, marginBottom: 18 }}>
              <Text variant="h1" style={{ fontSize: 21 }}>Identity Verification</Text>
              <Text variant="body" color="secondary">
                To keep KapitPondo secure, tell us which ID you're using and upload a clear photo of it.
              </Text>
            </View>

            <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>ID Type</Text>
            <Pressable
              onPress={() => setIdPickerOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: semantic.surfaceAlt, borderRadius: 12,
                paddingVertical: 14, paddingHorizontal: 14, marginBottom: 18,
              }}
            >
              <Text variant="body" style={{ flex: 1, color: idType ? semantic.textPrimary : semantic.textMuted }}>
                {idType ? idTypeLabel(idType) : 'Select your ID type'}
              </Text>
              <ChevronDown size={18} color={semantic.textMuted} />
            </Pressable>

            <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>Upload ID Photo</Text>
            <Pressable
              onPress={pickIdImage}
              style={{
                alignItems: 'center', gap: 10,
                borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 16,
                paddingVertical: 26, paddingHorizontal: 18, backgroundColor: semantic.surfaceAlt, marginBottom: 18,
              }}
            >
              {idImageUri ? (
                <Image source={{ uri: idImageUri }} style={{ width: '100%', height: 170, borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={26} color={semantic.brandDark} />
                  </View>
                  <Text variant="label">Tap to upload or take a photo</Text>
                  <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                    Supports JPG and PNG. Maximum file size: 5 MB.
                  </Text>
                </>
              )}
            </Pressable>

            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Info size={17} color={semantic.brandDark} />
                <Text variant="label">Photo guidelines</Text>
              </View>
              <View style={{ gap: 9 }}>
                {ID_GUIDES.map((g) => (
                  <View key={g} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#E2F0E8', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <Check size={12} color="#3E8E66" strokeWidth={2.4} />
                    </View>
                    <Text variant="bodySmall" style={{ flex: 1 }}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Button label="Next" onPress={() => setStep(2)} disabled={!canNext1} />
          </>
        )}

        {step === 2 && (
          <>
            <View style={{ gap: 5, marginBottom: 18 }}>
              <Text variant="h1" style={{ fontSize: 21 }}>Take a Selfie</Text>
              <Text variant="body" color="secondary">
                We'll match this selfie against your ID photo to confirm it's really you.
              </Text>
            </View>

            <Pressable
              onPress={takeSelfie}
              style={{
                alignItems: 'center', gap: 10,
                borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 16,
                paddingVertical: 26, paddingHorizontal: 18, backgroundColor: semantic.surfaceAlt, marginBottom: 18,
              }}
            >
              {selfieUri ? (
                <Image source={{ uri: selfieUri }} style={{ width: 170, height: 170, borderRadius: 85 }} resizeMode="cover" />
              ) : (
                <>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={26} color={semantic.brandDark} />
                  </View>
                  <Text variant="label">Tap to open the camera</Text>
                  <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                    Uses your front camera.
                  </Text>
                </>
              )}
            </Pressable>

            {selfieUri ? (
              <Pressable onPress={takeSelfie} style={{ alignSelf: 'center', marginBottom: 18 }}>
                <Text variant="label" color="brand">Retake</Text>
              </Pressable>
            ) : null}

            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Info size={17} color={semantic.brandDark} />
                <Text variant="label">Selfie guidelines</Text>
              </View>
              <View style={{ gap: 9 }}>
                {SELFIE_GUIDES.map((g) => (
                  <View key={g} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#E2F0E8', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <Check size={12} color="#3E8E66" strokeWidth={2.4} />
                    </View>
                    <Text variant="bodySmall" style={{ flex: 1 }}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Back" variant="ghost" onPress={() => setStep(1)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Next" onPress={() => setStep(3)} disabled={!canNext2} />
              </View>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <View style={{ gap: 5, marginBottom: 18 }}>
              <Text variant="h1" style={{ fontSize: 21 }}>Enter your Information</Text>
              <Text variant="body" color="secondary">
                Confirm your personal details for identity verification.
              </Text>
            </View>

            <SectionLabel>Personal Information</SectionLabel>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="First Name" placeholder="Juan" value={firstName} onChangeText={setFirstName} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Last Name" placeholder="Dela Cruz" value={lastName} onChangeText={setLastName} />
                </View>
              </View>
              <Field label="Middle Name (Optional)" placeholder="Santos" value={middleName} onChangeText={setMiddleName} />
              <Field
                label="Birthday (Optional)"
                placeholder="MM/DD/YYYY"
                keyboardType="numbers-and-punctuation"
                value={birthday}
                onChangeText={setBirthday}
              />
              <Field label="Nationality" placeholder="Filipino" value={nationality} onChangeText={setNationality} />
            </View>

            <SectionLabel>Contact Information</SectionLabel>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18, gap: 4 }, shadowToken.card]}>
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
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18 }, shadowToken.card]}>
              <Field label="Region (Optional)" placeholder="Region IV-A (CALABARZON)" value={region} onChangeText={setRegion} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Province" placeholder="Laguna" value={province} onChangeText={setProvince} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="City / Municipality" placeholder="Calamba" value={city} onChangeText={setCity} />
                </View>
              </View>
              <Field label="Barangay" placeholder="Barangay Halang" value={barangay} onChangeText={setBarangay} />
              <Field label="Street Address" placeholder="House No., Street, Subdivision" value={streetAddress} onChangeText={setStreetAddress} />
              <Field label="Zip Code (Optional)" placeholder="4027" keyboardType="numbers-and-punctuation" value={zipCode} onChangeText={setZipCode} />
            </View>

            <SectionLabel>Financial Information</SectionLabel>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18 }, shadowToken.card]}>
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
                <Button label="Back" variant="ghost" onPress={() => setStep(2)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Next" onPress={() => setStep(4)} disabled={!canNext3} />
              </View>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <View style={{ gap: 5, marginBottom: 18 }}>
              <Text variant="h1" style={{ fontSize: 21 }}>Review & Submit</Text>
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
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>ID Photo</Text>
                  {idImageUri ? <Image source={{ uri: idImageUri }} style={{ width: '100%', height: 90, borderRadius: 10 }} resizeMode="cover" /> : null}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Selfie</Text>
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
                  <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Nationality</Text>
                  <Text variant="body">{nationality || '—'}</Text>
                </View>
              </View>
              <View>
                <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 4 }}>Address</Text>
                <Text variant="body">{[streetAddress, barangay, city, province, region].filter(Boolean).join(', ')}</Text>
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
        visible={idPickerOpen}
        title="Select ID type"
        options={ID_TYPES}
        selected={idType}
        onSelect={(v) => { setIdType(v); setIdPickerOpen(false); }}
        onClose={() => setIdPickerOpen(false)}
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
    </SafeAreaView>
  );
}
