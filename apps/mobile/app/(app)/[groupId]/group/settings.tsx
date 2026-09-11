import { useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Smartphone, User2, MessageSquare, Check, Clock3, AlertTriangle, RotateCcw, QrCode as QrCodeIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useFundSummary } from '@/features/reporting/reporting.hooks';
import { useAction, useQuery } from '@/hooks/useApi';
import {
  listOfficers, submitGcashProposal, cancelGcashProposal, approveGcashProposal, rejectGcashProposal, listGcashHistory,
  type GcashHistoryEntry, type GcashStatus,
} from '@/api/groups';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

const GCASH_DIGITS_RE = /^09\d{9}$/;

function formatGcashDigits(digits: string): string {
  if (digits.length > 7) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.length > 4) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
}

function SectionHead({ title }: { title: string }) {
  return <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 22, marginBottom: 11 }}>{title}</Text>;
}

function StatusPill({ status }: { status: GcashStatus }) {
  const cfg: Record<GcashStatus, { label: string; tone: IntentName }> = {
    unset: { label: 'Not set', tone: 'neutral' },
    pending: { label: 'Pending review', tone: 'warning' },
    approved: { label: 'Approved · active', tone: 'success' },
    rejected: { label: 'Rejected', tone: 'danger' },
  };
  const { label, tone } = cfg[status];
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 20 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.text }} />
      <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: semantic.border }}>
      <Text variant="caption" color="secondary">{label}</Text>
      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, textAlign: 'right', maxWidth: '62%' }}>{value}</Text>
    </View>
  );
}

/** The Treasurer's uploaded GCash QR screenshot, shown wherever a submission is displayed. */
function QrThumb({ path }: { path: string | null | undefined }) {
  const url = useSignedProofUrl(path);
  if (!path) return null;
  return (
    <View style={{ alignItems: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 13 }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: 120, height: 120, borderRadius: 6 }} resizeMode="contain" />
      ) : (
        <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={semantic.brand} />
        </View>
      )}
    </View>
  );
}

function Banner({ tone, children }: { tone: 'success' | 'danger' | 'warning'; children: React.ReactNode }) {
  const t = intent[tone];
  return (
    <View style={{ backgroundColor: t.soft, borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <Text style={{ fontSize: 12.5, color: t.text, lineHeight: 17 }}>{children}</Text>
    </View>
  );
}

const HISTORY_LABEL: Record<GcashHistoryEntry['action'], string> = {
  proposed: 'GCash number submitted',
  cancelled: 'Submission withdrawn',
  approved: 'GCash number approved',
  rejected: 'Submission rejected',
};
const HISTORY_ICON: Record<GcashHistoryEntry['action'], any> = {
  proposed: Clock3, cancelled: RotateCcw, approved: Check, rejected: AlertTriangle,
};
const HISTORY_TONE: Record<GcashHistoryEntry['action'], IntentName> = {
  proposed: 'warning', cancelled: 'neutral', approved: 'success', rejected: 'danger',
};

function HistoryList({ entries }: { entries: GcashHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, CARD_SHADOW]}>
        <Text variant="body" color="muted">No changes yet.</Text>
      </View>
    );
  }
  return (
    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, CARD_SHADOW]}>
      {entries.map((e, i) => {
        const Icon = HISTORY_ICON[e.action];
        const t = intent[HISTORY_TONE[e.action]];
        const detail = e.after_data?.reason ?? (e.after_data?.number ? `${e.after_data.number}${e.after_data.name ? ` · ${e.after_data.name}` : ''}` : null);
        return (
          <View key={e.id} style={{ flexDirection: 'row', gap: 12, padding: 13, borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
            <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Icon size={13} color={t.text} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{HISTORY_LABEL[e.action]}</Text>
                <Text variant="caption" color="muted">{formatDateTime(e.created_at)}</Text>
              </View>
              <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 15 }} numberOfLines={2}>
                {e.actor?.full_name ?? 'Someone'}{detail ? ` — ${detail}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function GroupSettings() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group, role } = useActiveGroup();
  const { refresh } = useGroups();
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);
  const history = useQuery(() => listGcashHistory(groupId!), [groupId]);
  const fund = useFundSummary(groupId!);

  const treasurerName = officers.data?.officers.find((o) => o.role === 'treasurer')?.full_name ?? 'the Treasurer';
  const status = group?.treasurer_gcash_status ?? 'unset';

  // Local override so "Propose change" (from 'approved') and "Fix and
  // resubmit" (from 'rejected') can show the submission form even though
  // the server-side status hasn't moved to 'pending' yet.
  const [showForm, setShowForm] = useState(false);
  const effectiveStatus: GcashStatus | 'form' = showForm ? 'form' : status;

  async function afterMutation() {
    setShowForm(false);
    await refresh();
    history.refetch();
  }

  if (role !== 'owner' && role !== 'treasurer') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Group settings" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>Only the Owner and Treasurer can view this page.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Group settings" subtitle={group?.name ?? ''} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {role === 'treasurer' ? (
          <View style={{ flexDirection: 'row', gap: 10, backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13 }}>
            <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: semantic.dashCard, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#fff' }}>i</Text>
            </View>
            <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 16 }}>
              As <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>Treasurer</Text>, you propose the group's GCash number. The <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>Owner</Text> reviews and approves it before members see it on the contribution page.
            </Text>
          </View>
        ) : null}

        <SectionHead title="Payment channel" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderColor: semantic.border }}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: '#007DFE', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_800ExtraBold', color: '#fff' }}>G</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>GCash number</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>Where members send contributions</Text>
            </View>
            <StatusPill status={status} />
          </View>

          <View style={{ padding: 15 }}>
            {effectiveStatus === 'form' ? (
              <ProposeForm
                groupId={groupId!}
                initialNumber={status === 'rejected' ? group?.treasurer_gcash_pending_number ?? '' : ''}
                initialName={status === 'rejected' ? group?.treasurer_gcash_pending_name ?? '' : ''}
                initialNote={status === 'rejected' ? group?.treasurer_gcash_note ?? '' : ''}
                initialQrUrl={status === 'rejected' ? group?.treasurer_gcash_pending_qr_url ?? null : null}
                onCancel={() => setShowForm(false)}
                onSubmitted={afterMutation}
              />
            ) : effectiveStatus === 'unset' ? (
              role === 'treasurer' ? (
                <ProposeForm groupId={groupId!} onSubmitted={afterMutation} />
              ) : (
                <Text variant="body" color="secondary" style={{ textAlign: 'center', lineHeight: 19 }}>
                  No GCash number has been submitted yet. Waiting for the <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>Treasurer</Text> to propose one.
                </Text>
              )
            ) : effectiveStatus === 'pending' ? (
              <View>
                {role === 'owner' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 11, marginBottom: 13 }}>
                    <Avatar name={treasurerName} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Submitted by {treasurerName}</Text>
                      <Text variant="caption" color="muted" style={{ marginTop: 1 }}>Treasurer · {formatDateTime(group?.treasurer_gcash_submitted_at ?? null)}</Text>
                    </View>
                  </View>
                ) : (
                  <Banner tone="warning">
                    <Text style={{ fontWeight: '700' }}>Waiting for Owner approval.</Text> Members won't see this number until it's approved.
                  </Banner>
                )}

                <QrThumb path={group?.treasurer_gcash_pending_qr_url} />
                <DetailRow label="GCash number" value={formatGcashDigits(group?.treasurer_gcash_pending_number ?? '')} />
                <DetailRow label="Account name" value={group?.treasurer_gcash_pending_name ?? '—'} />
                {role === 'owner' ? <DetailRow label="Group balance now" value={formatPeso(fund.data?.available_cash ?? 0)} /> : null}
                {group?.treasurer_gcash_note ? <DetailRow label="Note" value={group.treasurer_gcash_note} /> : null}

                {role === 'owner' ? (
                  <OwnerApproveReject groupId={groupId!} onDone={afterMutation} />
                ) : (
                  <Button label="Cancel submission" variant="ghost" onPress={() => confirmCancel(groupId!, afterMutation)} style={{ marginTop: 14 }} />
                )}
              </View>
            ) : effectiveStatus === 'approved' ? (
              <View>
                <Banner tone="success">
                  <Text style={{ fontWeight: '700' }}>Active.</Text> Members see this number{group?.treasurer_gcash_qr_url ? ' and QR' : ''} on the contribution page. Any change needs the Owner's approval again.
                </Banner>
                <QrThumb path={group?.treasurer_gcash_qr_url} />
                <DetailRow label="GCash number" value={formatGcashDigits(group?.treasurer_gcash_number ?? '')} />
                <DetailRow label="Account name" value={group?.treasurer_gcash_name ?? '—'} />
                <DetailRow label="Submitted by" value={`${treasurerName} (Treasurer)`} />
                <DetailRow label="Approved on" value={formatDateTime(group?.treasurer_gcash_reviewed_at ?? null)} />
                {role === 'treasurer' ? (
                  <Button label="Propose change" variant="ghost" onPress={() => setShowForm(true)} style={{ marginTop: 14 }} />
                ) : null}
              </View>
            ) : (
              <View>
                <View style={{ backgroundColor: intent.danger.soft, borderRadius: 12, padding: 12, marginBottom: 14 }}>
                  <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: intent.danger.text, marginBottom: 4 }}>
                    {role === 'owner' ? 'You rejected this submission' : 'Rejected by Owner'}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: semantic.textPrimary, lineHeight: 17 }}>
                    {group?.treasurer_gcash_rejection_reason ?? 'No reason was given.'}
                  </Text>
                </View>
                <QrThumb path={group?.treasurer_gcash_pending_qr_url} />
                <DetailRow label="Submitted by" value={`${treasurerName} (Treasurer)`} />
                <DetailRow label="GCash number" value={formatGcashDigits(group?.treasurer_gcash_pending_number ?? '')} />
                <DetailRow label="Rejected on" value={formatDateTime(group?.treasurer_gcash_reviewed_at ?? null)} />

                {role === 'treasurer' ? (
                  <Button label="Fix and resubmit" onPress={() => setShowForm(true)} style={{ marginTop: 14 }} />
                ) : (
                  <Text variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 14, lineHeight: 16 }}>
                    Waiting for the Treasurer to fix the details and resubmit.
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        <SectionHead title="Group officers" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
          {officers.loading ? (
            <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>Loading…</Text>
          ) : (officers.data?.officers.length ?? 0) === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No officers assigned yet.</Text>
          ) : (
            officers.data!.officers.map((o, i) => (
              <View key={`${o.role}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < officers.data!.officers.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <Avatar name={o.full_name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{o.full_name ?? 'Unnamed'}</Text>
                  <Text variant="caption" color="muted" style={{ marginTop: 1, textTransform: 'capitalize' }}>{o.role}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <SectionHead title="Change history" />
        <HistoryList entries={history.data ?? []} />

      </ScrollView>
    </SafeAreaView>
  );
}

function confirmCancel(groupId: string, onDone: () => void) {
  Alert.alert('Withdraw submission?', "The Owner won't see it anymore. You can resubmit anytime.", [
    { text: 'Keep it', style: 'cancel' },
    {
      text: 'Withdraw', style: 'destructive', onPress: async () => {
        try { await cancelGcashProposal(groupId); onDone(); } catch (e) { Alert.alert('Could not withdraw', (e as Error).message); }
      },
    },
  ]);
}

function OwnerApproveReject({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const approve = useAction(() => approveGcashProposal(groupId));
  const reject = useAction((reason: string) => rejectGcashProposal(groupId, reason));
  const [rejecting, setRejecting] = useState(false);

  async function onApprove() {
    const ok = await approve.run();
    if (ok !== undefined) onDone();
    else if (approve.error) Alert.alert('Could not approve', approve.error.message);
  }
  async function onReject(reason: string) {
    setRejecting(false);
    if (!reason.trim()) return Alert.alert('Reason required', 'Explain what needs to be corrected before resubmission.');
    const ok = await reject.run(reason.trim());
    if (ok !== undefined) onDone();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Button label="Reject" variant="ghost" onPress={() => setRejecting(true)} disabled={approve.loading || reject.loading} style={{ borderColor: intent.danger.base, borderWidth: 1.5 }} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Approve" onPress={onApprove} loading={approve.loading} disabled={reject.loading} />
        </View>
      </View>
      <ReasonPrompt
        visible={rejecting}
        title="Reject this submission?"
        placeholder="Explain what needs to be corrected before resubmission..."
        confirmLabel="Send rejection"
        destructive
        onCancel={() => setRejecting(false)}
        onConfirm={onReject}
      />
    </>
  );
}

function ProposeForm({
  groupId, initialNumber = '', initialName = '', initialNote = '', initialQrUrl = null, onCancel, onSubmitted,
}: {
  groupId: string; initialNumber?: string; initialName?: string; initialNote?: string; initialQrUrl?: string | null;
  onCancel?: () => void; onSubmitted: () => void;
}) {
  const [numberDigits, setNumberDigits] = useState(initialNumber.replace(/\D/g, ''));
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState(initialNote);
  // Carries forward a previously-uploaded QR (e.g. resubmitting after a
  // rejection) until the Treasurer picks a new one to replace it.
  const [existingQrUrl, setExistingQrUrl] = useState(initialQrUrl);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const existingQrSignedUrl = useSignedProofUrl(qrUri ? null : existingQrUrl);

  async function pickQr() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach your GCash QR.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled) return;
    setQrUri(res.assets[0].uri);
    setExistingQrUrl(null);
  }

  async function onSubmit() {
    if (!GCASH_DIGITS_RE.test(numberDigits)) {
      return Alert.alert('Invalid number', 'Enter an 11-digit PH mobile number registered to GCash.');
    }
    if (!name.trim()) {
      return Alert.alert('Account name required', "Enter the GCash account holder's name.");
    }
    setUploadingQr(true);
    try {
      let qrUrl = existingQrUrl ?? undefined;
      if (qrUri) qrUrl = await uploadImage('proofs', qrUri, 'gcash-qr');
      const ok = await submitGcashProposal(groupId, { number: numberDigits, name: name.trim(), note: note.trim() || undefined, qr_url: qrUrl }).catch((e) => {
        Alert.alert('Could not submit', (e as Error).message);
        return undefined;
      });
      if (ok !== undefined) onSubmitted();
    } finally {
      setUploadingQr(false);
    }
  }

  const qrPreviewUri = qrUri ?? existingQrSignedUrl;

  return (
    <View>
      <Text variant="body" color="secondary" style={{ lineHeight: 19, marginBottom: 14 }}>
        {initialNumber
          ? 'Fix the details below and resubmit for the Owner\'s approval.'
          : "No GCash number is set for this group yet. Fill in the details below and submit for the Owner's approval."}
      </Text>

      <Field
        label="GCash number"
        placeholder="09XX XXX XXXX"
        value={formatGcashDigits(numberDigits)}
        onChangeText={(t) => setNumberDigits(t.replace(/\D/g, '').slice(0, 11))}
        keyboardType="phone-pad"
        leading={<Smartphone size={18} color={semantic.textMuted} />}
      />
      <Text variant="caption" color="muted" style={{ marginTop: -10, marginBottom: 4 }}>11-digit Philippine mobile number registered to GCash.</Text>

      <Field
        label="Account name"
        placeholder="e.g. Maria S. Reyes"
        value={name}
        onChangeText={setName}
        leading={<User2 size={18} color={semantic.textMuted} />}
      />
      <Text variant="caption" color="muted" style={{ marginTop: -10, marginBottom: 4 }}>Must match the GCash account holder.</Text>

      <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500', marginBottom: 7 }}>Your GCash QR (optional)</Text>
      <Pressable onPress={pickQr} style={{ alignItems: 'center', gap: 6, borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 14, paddingVertical: 16, backgroundColor: semantic.surfaceAlt, marginBottom: 6 }}>
        {qrPreviewUri ? (
          <Image source={{ uri: qrPreviewUri }} style={{ width: 110, height: 110, borderRadius: 8 }} resizeMode="contain" />
        ) : (
          <>
            <QrCodeIcon size={22} color={semantic.brandDark} />
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>Attach your GCash QR</Text>
          </>
        )}
      </Pressable>
      <Text variant="caption" color="muted" style={{ marginBottom: 15, lineHeight: 15 }}>
        In your GCash app: Profile → QR → save/screenshot your own "Receive Money" QR, then attach it here. Members will see this exact image — never a generated one, so it always scans correctly. Optional — the number above always works even without it.
      </Text>

      <Field
        label="Note to Owner (optional)"
        placeholder="Anything the Owner should know before approving..."
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        leading={<MessageSquare size={18} color={semantic.textMuted} />}
      />

      <Button label="Submit for Owner approval" onPress={onSubmit} loading={uploadingQr} style={{ marginTop: 8 }} />
      {onCancel ? <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}
