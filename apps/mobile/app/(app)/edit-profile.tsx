import { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Alert, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ChevronDown, ChevronRight, Check, X, Phone, Mail, Lock, AlertTriangle, Camera } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken, intent } from '@/theme/colors';
import { updateProfile } from '@/api/members';
import { submitProfileUpdateRequest, listMyProfileUpdateRequests, type ProfileUpdateField, type ProfileUpdateReason, type ProfileUpdateRequest } from '@/api/profileUpdateRequests';
import { SOURCE_OF_FUNDS, sourceOfFundsLabel } from '@/constants/sourceOfFunds';
import { EMPLOYMENT_STATUSES, employmentStatusLabel } from '@/constants/employmentStatus';
import { useAuth } from '@/context/AuthContext';
import { formatPH } from '@/lib/phone';
import { uploadImage, uploadAvatar } from '@/lib/upload';

const BAND_TOP = '#4C7C90';

type PickerOption = { label: string; value: string };

type FieldConfig = {
  key: ProfileUpdateField;
  label: string;
  placeholder?: string;
  kind: 'text' | 'picker';
  options?: PickerOption[];
};

const PERSONAL_FIELDS: FieldConfig[] = [
  { key: 'first_name', label: 'First Name', placeholder: 'Juan', kind: 'text' },
  { key: 'last_name', label: 'Last Name', placeholder: 'Dela Cruz', kind: 'text' },
  { key: 'middle_name', label: 'Middle Name', placeholder: 'Santos', kind: 'text' },
  { key: 'birthday', label: 'Birthday', placeholder: 'MM/DD/YYYY', kind: 'text' },
  { key: 'nationality', label: 'Nationality', placeholder: 'Filipino', kind: 'text' },
];

const ADDRESS_FIELDS: FieldConfig[] = [
  { key: 'region', label: 'Region', placeholder: 'Region IV-A (CALABARZON)', kind: 'text' },
  { key: 'province', label: 'Province', placeholder: 'Laguna', kind: 'text' },
  { key: 'city', label: 'City / Municipality', placeholder: 'Calamba', kind: 'text' },
  { key: 'barangay', label: 'Barangay', placeholder: 'Barangay Halang', kind: 'text' },
  { key: 'street_address', label: 'Street Address', placeholder: 'House No., Street, Subdivision', kind: 'text' },
  { key: 'zip_code', label: 'Zip Code', placeholder: '4027', kind: 'text' },
];

const FINANCIAL_FIELDS: FieldConfig[] = [
  { key: 'source_of_funds', label: 'Source of Funds', kind: 'picker', options: SOURCE_OF_FUNDS },
  { key: 'employment_status', label: 'Employment Status', kind: 'picker', options: EMPLOYMENT_STATUSES },
  { key: 'occupation', label: 'Occupation / Job Title', placeholder: 'e.g. Sari-sari store owner', kind: 'text' },
];

const REASONS: { value: ProfileUpdateReason; label: string }[] = [
  { value: 'typo', label: 'Correction of a typo or spelling error' },
  { value: 'legal_name_change', label: 'Legal name change (marriage, court order)' },
  { value: 'other', label: 'Other' },
];

function displayValue(field: FieldConfig, raw: string | null | undefined): string {
  if (!raw) return '—';
  if (field.key === 'source_of_funds') return sourceOfFundsLabel(raw);
  if (field.key === 'employment_status') return employmentStatusLabel(raw);
  return raw;
}

function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" style={{ fontSize: 13, marginBottom: 10 }}>{children}</Text>;
}

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

export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member, refreshMember } = useAuth();
  const isVerified = member?.verification_status === 'verified';

  // ---- editable form state (only used while NOT verified) ----
  const [firstName, setFirstName] = useState(member?.first_name ?? '');
  const [middleName, setMiddleName] = useState(member?.middle_name ?? '');
  const [lastName, setLastName] = useState(member?.last_name ?? '');
  const [birthday, setBirthday] = useState(member?.birthday ?? '');
  const [nationality, setNationality] = useState(member?.nationality ?? '');
  const [region, setRegion] = useState(member?.region ?? '');
  const [province, setProvince] = useState(member?.province ?? '');
  const [city, setCity] = useState(member?.city ?? '');
  const [barangay, setBarangay] = useState(member?.barangay ?? '');
  const [streetAddress, setStreetAddress] = useState(member?.street_address ?? '');
  const [zipCode, setZipCode] = useState(member?.zip_code ?? '');
  const [sourceOfFunds, setSourceOfFunds] = useState<string | null>(member?.source_of_funds ?? null);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState<string | null>(member?.employment_status ?? null);
  const [employmentPickerOpen, setEmploymentPickerOpen] = useState(false);
  const [occupation, setOccupation] = useState(member?.occupation ?? '');
  const [saving, setSaving] = useState(false);
  const canSave = !!firstName.trim() && !!lastName.trim();

  // ---- update-request state (only used while verified) ----
  const [pendingRequests, setPendingRequests] = useState<ProfileUpdateRequest[] | null>(null);
  const [requestModalField, setRequestModalField] = useState<FieldConfig | null>(null);

  useEffect(() => {
    if (!isVerified) return;
    listMyProfileUpdateRequests().then(setPendingRequests).catch(() => setPendingRequests([]));
  }, [isVerified]);

  const pendingCount = (pendingRequests ?? []).filter((r) => r.status === 'pending').length;

  // ---- profile photo (cosmetic, not KYC data — stays editable regardless of verification status) ----
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function pickAvatar() {
    if (!member) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled) return;
    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadAvatar(member.id, res.assets[0].uri);
      await updateProfile({ avatar_url: avatarUrl });
      await refreshMember();
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        middle_name: middleName.trim() || undefined,
        last_name: lastName.trim(),
        birthday: birthday.trim() || undefined,
        nationality: nationality.trim() || undefined,
        region: region.trim() || undefined,
        province: province.trim() || undefined,
        city: city.trim() || undefined,
        barangay: barangay.trim() || undefined,
        street_address: streetAddress.trim() || undefined,
        zip_code: zipCode.trim() || undefined,
        source_of_funds: sourceOfFunds ?? undefined,
        employment_status: employmentStatus ?? undefined,
        occupation: occupation.trim() || undefined,
      });
      await refreshMember();
      router.back();
    } catch (e) {
      Alert.alert('Update failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function renderEditableField(f: FieldConfig) {
    if (f.kind === 'picker') {
      const value = f.key === 'source_of_funds' ? sourceOfFunds : employmentStatus;
      const setOpen = f.key === 'source_of_funds' ? setSourcePickerOpen : setEmploymentPickerOpen;
      return (
        <View key={f.key} style={{ marginBottom: 15 }}>
          <Text variant="label" color="secondary" style={{ fontSize: 12.5, marginBottom: 8 }}>{f.label}</Text>
          <Pressable
            onPress={() => setOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 }}
          >
            <Text variant="body" style={{ flex: 1, color: value ? semantic.textPrimary : semantic.textMuted }}>
              {value ? displayValue(f, value) : `Select ${f.label.toLowerCase()}`}
            </Text>
            <ChevronDown size={18} color={semantic.textMuted} />
          </Pressable>
        </View>
      );
    }
    const stateMap: Record<string, [string, (v: string) => void]> = {
      first_name: [firstName, setFirstName], middle_name: [middleName, setMiddleName], last_name: [lastName, setLastName],
      birthday: [birthday, setBirthday], nationality: [nationality, setNationality],
      region: [region, setRegion], province: [province, setProvince], city: [city, setCity],
      barangay: [barangay, setBarangay], street_address: [streetAddress, setStreetAddress], zip_code: [zipCode, setZipCode],
      occupation: [occupation, setOccupation],
    };
    const [value, setValue] = stateMap[f.key];
    return <Field key={f.key} label={f.label} placeholder={f.placeholder} value={value} onChangeText={setValue} />;
  }

  function renderLockedField(f: FieldConfig) {
    const rawValue = f.key === 'source_of_funds' ? member?.source_of_funds : f.key === 'employment_status' ? member?.employment_status : (member as any)?.[f.key];
    return (
      <Pressable
        key={f.key}
        onPress={() => setRequestModalField(f)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 13 }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="muted">{f.label}</Text>
          <Text variant="body" style={{ marginTop: 2 }} numberOfLines={1}>{displayValue(f, rawValue)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Lock size={11} color={semantic.textMuted} />
          <Text variant="caption" style={{ color: semantic.brandDark, fontWeight: '600' }}>Request change</Text>
        </View>
      </Pressable>
    );
  }

  function renderSection(title: string, fields: FieldConfig[]) {
    return (
      <View style={{ marginBottom: 18 }}>
        <SectionLabel>{title}</SectionLabel>
        {isVerified ? (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, paddingHorizontal: 16 }, shadowToken.card]}>
            {fields.map((f, i) => (
              <View key={f.key} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: semantic.border }}>
                {renderLockedField(f)}
              </View>
            ))}
          </View>
        ) : (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
            {fields.map(renderEditableField)}
          </View>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BAND_TOP }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
        <AppBar title="Edit Profile" backgroundColor={BAND_TOP} tintColor="#fff" />

        <View style={{ alignItems: 'center', paddingTop: 4, paddingBottom: 22 }}>
          <Pressable onPress={pickAvatar} disabled={uploadingAvatar}>
            <Avatar name={member?.full_name} uri={member?.avatar_url} size={92} />
            <View
              style={{
                position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15,
                backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: BAND_TOP,
              }}
            >
              {uploadingAvatar ? <ActivityIndicator size="small" color={semantic.brandDark} /> : <Camera size={14} color={semantic.brandDark} />}
            </View>
          </Pressable>
          <Pressable onPress={pickAvatar} disabled={uploadingAvatar} hitSlop={8} style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: 'rgba(255,255,255,0.92)' }}>
              {uploadingAvatar ? 'Uploading…' : 'Change photo'}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {isVerified ? (
            <>
              <View style={{ flexDirection: 'row', gap: 10, backgroundColor: intent.warning.soft, borderRadius: 12, padding: 13, marginBottom: 18 }}>
                <Lock size={16} color={intent.warning.text} style={{ marginTop: 1 }} />
                <Text variant="caption" style={{ color: intent.warning.text, flex: 1, lineHeight: 18 }}>
                  Verified information is locked. Tap a field below to request a change.
                </Text>
              </View>

              <Pressable
                onPress={() => router.push('/(app)/my-update-requests' as any)}
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 16, padding: 14, marginBottom: 18 }, shadowToken.card]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="label" style={{ fontSize: 13.5 }}>My update requests</Text>
                  <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                    {pendingCount > 0 ? `${pendingCount} awaiting review` : 'Track status and history'}
                  </Text>
                </View>
                <ChevronRight size={18} color={semantic.textMuted} />
              </Pressable>
            </>
          ) : null}

          {renderSection('Personal Information', PERSONAL_FIELDS)}

          <SectionLabel>Contact Information</SectionLabel>
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 18, gap: 4 }, shadowToken.card]}>
            <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Mobile Number</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Phone size={16} color={semantic.textMuted} />
              <Text variant="body" style={{ flexShrink: 1 }}>{member?.phone ? formatPH(member.phone) : '—'}</Text>
            </View>
            <Text variant="caption" color="secondary" style={{ marginBottom: 10 }}>Cannot be changed</Text>

            <Text variant="label" color="secondary" style={{ fontSize: 12.5 }}>Email Address</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Mail size={16} color={semantic.textMuted} />
              <Text variant="body" style={{ flexShrink: 1 }} numberOfLines={1}>{member?.email || '—'}</Text>
            </View>
            <Text variant="caption" color="secondary">Manage from the Email Address screen</Text>
          </View>

          {renderSection('Residential Address', ADDRESS_FIELDS)}
          {renderSection('Financial Information', FINANCIAL_FIELDS)}

          {!isVerified ? <Button label="Save Changes" onPress={onSave} loading={saving} disabled={!canSave} /> : null}
        </ScrollView>
      </SafeAreaView>

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

      {requestModalField ? (
        <UpdateRequestModal
          field={requestModalField}
          currentValue={displayValue(requestModalField, requestModalField.key === 'source_of_funds' ? member?.source_of_funds : requestModalField.key === 'employment_status' ? member?.employment_status : (member as any)?.[requestModalField.key])}
          memberId={member!.id}
          onClose={() => setRequestModalField(null)}
          onSubmitted={() => {
            setRequestModalField(null);
            listMyProfileUpdateRequests().then(setPendingRequests).catch(() => {});
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function UpdateRequestModal({
  field, currentValue, memberId, onClose, onSubmitted,
}: {
  field: FieldConfig;
  currentValue: string;
  memberId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [newValue, setNewValue] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reason, setReason] = useState<ProfileUpdateReason | null>(null);
  const [details, setDetails] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const canSubmit = !!newValue.trim() && !!reason;

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach supporting proof.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSubmit() {
    if (!canSubmit || !reason) return;
    setSubmitting(true);
    setError(undefined);
    try {
      let proofPath: string | undefined;
      if (proofUri) proofPath = await uploadImage('proofs', proofUri, `profile-update/${memberId}`);
      await submitProfileUpdateRequest({
        field: field.key,
        current_value: currentValue === '—' ? null : currentValue,
        new_value: newValue.trim(),
        reason,
        details: details.trim() || undefined,
        proof_url: proofPath,
      });
      onSubmitted();
    } catch (e) {
      setError((e as Error).message || 'Could not submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.45)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: semantic.border, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Text variant="h3" style={{ fontSize: 16, flex: 1 }}>Information Update Request</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
            <Text variant="bodySmall" color="secondary" style={{ marginBottom: 14, lineHeight: 19 }}>
              Editing <Text style={{ fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{field.label.toLowerCase()}</Text> requires review. Your current information stays active until the request is approved.
            </Text>

            <Text variant="label" color="secondary" style={{ fontSize: 12, marginBottom: 6 }}>Current value</Text>
            <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <Text variant="body" color="secondary">{currentValue}</Text>
            </View>

            {field.kind === 'picker' ? (
              <>
                <Text variant="label" color="secondary" style={{ fontSize: 12, marginBottom: 6 }}>New value</Text>
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surfaceAlt, borderRadius: 10, padding: 12, marginBottom: 14 }}
                >
                  <Text variant="body" style={{ flex: 1, color: newValue ? semantic.textPrimary : semantic.textMuted }}>
                    {newValue ? displayValue(field, newValue) : `Select ${field.label.toLowerCase()}`}
                  </Text>
                  <ChevronDown size={18} color={semantic.textMuted} />
                </Pressable>
              </>
            ) : (
              <Field label="New value" placeholder="Enter the corrected information" value={newValue} onChangeText={setNewValue} />
            )}

            <Text variant="label" color="secondary" style={{ fontSize: 12, marginBottom: 8 }}>Reason for change</Text>
            <View style={{ gap: 8, marginBottom: 14 }}>
              {REASONS.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: reason === r.value ? semantic.surfaceAlt : 'transparent', borderWidth: 1, borderColor: reason === r.value ? semantic.brand : semantic.border, borderRadius: 10, padding: 12 }}
                >
                  <Text variant="body" style={{ flex: 1, fontSize: 13.5 }}>{r.label}</Text>
                  {reason === r.value ? <Check size={16} color={semantic.brandDark} /> : null}
                </Pressable>
              ))}
            </View>

            <View style={{ marginBottom: 14 }}>
              <Field label="Additional details (optional)" placeholder="Give the reviewer any context that helps them decide." value={details} onChangeText={setDetails} multiline numberOfLines={3} style={{ minHeight: 64, textAlignVertical: 'top' }} />
            </View>

            <Text variant="label" color="secondary" style={{ fontSize: 12, marginBottom: 8 }}>Supporting proof (optional)</Text>
            <Pressable
              onPress={pickProof}
              style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: semantic.border, backgroundColor: semantic.surfaceAlt, borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 14 }}
            >
              <Text variant="label" style={{ fontSize: 13, marginBottom: 2 }}>{proofUri ? 'Photo attached — tap to change' : 'Upload proof'}</Text>
              <Text variant="caption" color="secondary">New ID, marriage certificate, or similar</Text>
            </Pressable>

            {reason === 'legal_name_change' ? (
              <View style={{ flexDirection: 'row', gap: 8, backgroundColor: intent.warning.soft, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <AlertTriangle size={15} color={intent.warning.text} style={{ marginTop: 1 }} />
                <Text variant="caption" style={{ color: intent.warning.text, flex: 1, lineHeight: 17 }}>
                  <Text style={{ fontFamily: 'Poppins_700Bold' }}>Re-verification required.</Text> Once approved, your account returns to unverified so you can verify your identity again. You keep full access in the meantime.
                </Text>
              </View>
            ) : null}

            {error ? <Text variant="caption" style={{ color: intent.danger.text, marginBottom: 8 }}>{error}</Text> : null}
          </ScrollView>

          <View style={{ padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: semantic.border }}>
            <Button label="Submit for review" onPress={onSubmit} loading={submitting} disabled={!canSubmit} />
          </View>

          {field.kind === 'picker' ? (
            <PickerSheet
              visible={pickerOpen}
              title={`Select ${field.label.toLowerCase()}`}
              options={field.options ?? []}
              selected={newValue || null}
              onSelect={(v) => { setNewValue(v); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)}
              insets={insets}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
