/**
 * app/(app)/edit-profile.tsx — edit personal info (name, contact, address,
 * financial details). Reached from Profile's "Edit Profile" row.
 *
 * Deliberately excludes: phone (the OTP-verified sign-in credential, changed
 * via a dedicated re-verification flow, not here) and the KYC fields
 * (id_document_url, selfie_url, id_type, verification_status), which stay
 * under (app)/identity.tsx's submit/resubmit flow.
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronDown, Check, X, Phone } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { updateProfile } from '@/api/members';
import { SOURCE_OF_FUNDS, sourceOfFundsLabel } from '@/constants/sourceOfFunds';
import { EMPLOYMENT_STATUSES, employmentStatusLabel } from '@/constants/employmentStatus';
import { useAuth } from '@/context/AuthContext';
import { formatPH } from '@/lib/phone';

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

export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member, refreshMember } = useAuth();

  const [firstName, setFirstName] = useState(member?.first_name ?? '');
  const [middleName, setMiddleName] = useState(member?.middle_name ?? '');
  const [lastName, setLastName] = useState(member?.last_name ?? '');
  const [birthday, setBirthday] = useState(member?.birthday ?? '');
  const [nationality, setNationality] = useState(member?.nationality ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
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
        email: email.trim() || undefined,
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

  return (
    <View style={{ flex: 1, backgroundColor: semantic.background }}>
      <AppBar title="Edit Profile" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
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
            <Text variant="caption" color="secondary">(verified, cannot be changed here)</Text>
          </View>
          <Field
            label="Email Address (Optional)"
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
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
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16, marginBottom: 22 }, shadowToken.card]}>
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

        <Button label="Save Changes" onPress={onSave} loading={saving} disabled={!canSave} />
      </ScrollView>

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
    </View>
  );
}
