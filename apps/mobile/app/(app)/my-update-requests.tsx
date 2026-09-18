import { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { listMyProfileUpdateRequests, type ProfileUpdateRequest } from '@/api/profileUpdateRequests';
import { sourceOfFundsLabel } from '@/constants/sourceOfFunds';
import { employmentStatusLabel } from '@/constants/employmentStatus';

const BAND_TOP = '#4C7C90';

const FIELD_LABEL: Record<string, string> = {
  first_name: 'First Name', middle_name: 'Middle Name', last_name: 'Last Name',
  birthday: 'Birthday', nationality: 'Nationality',
  region: 'Region', province: 'Province', city: 'City / Municipality', barangay: 'Barangay',
  street_address: 'Street Address', zip_code: 'Zip Code',
  source_of_funds: 'Source of Funds', employment_status: 'Employment Status', occupation: 'Occupation',
};

const STATUS_META: Record<ProfileUpdateRequest['status'], { label: string; tone: IntentName }> = {
  pending: { label: 'Under review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

function displayValue(field: string, raw: string): string {
  if (field === 'source_of_funds') return sourceOfFundsLabel(raw);
  if (field === 'employment_status') return employmentStatusLabel(raw);
  return raw;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MyUpdateRequests() {
  const [requests, setRequests] = useState<ProfileUpdateRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setRequests(await listMyProfileUpdateRequests());
      } catch (e) {
        setError((e as Error).message || "Couldn't load your update requests.");
      }
    })();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="My Update Requests" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        <Text variant="body" color="secondary" style={{ marginBottom: 18 }}>
          Every change you've requested to your locked profile information, and its review status.
        </Text>

        {error ? (
          <Text variant="caption" style={{ color: intent.danger.text }}>{error}</Text>
        ) : requests === null ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={semantic.brand} />
          </View>
        ) : requests.length === 0 ? (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 20 }}>
            You haven't submitted any update requests yet.
          </Text>
        ) : (
          requests.map((r, i) => {
            const meta = STATUS_META[r.status];
            const tone = intent[meta.tone];
            return (
              <View key={r.id} style={{ paddingVertical: 14, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: semantic.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text variant="label" style={{ fontSize: 13.5, flex: 1 }}>{FIELD_LABEL[r.field] ?? r.field}</Text>
                  <View style={{ backgroundColor: tone.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: tone.text }}>{meta.label}</Text>
                  </View>
                </View>
                <Text variant="caption" color="secondary" style={{ marginTop: 4 }}>
                  {r.current_value ? `${displayValue(r.field, r.current_value)} → ` : ''}{displayValue(r.field, r.new_value)}
                </Text>
                <Text variant="caption" color="muted" style={{ marginTop: 4 }}>Submitted {formatDate(r.created_at)}</Text>
                {r.status === 'rejected' && r.rejection_reason ? (
                  <Text variant="caption" style={{ color: intent.danger.text, marginTop: 4 }}>{r.rejection_reason}</Text>
                ) : null}
                {r.status === 'approved' && r.requires_reverification ? (
                  <Text variant="caption" style={{ color: intent.warning.text, marginTop: 4 }}>
                    Approved — verify your account again to keep full access.
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
