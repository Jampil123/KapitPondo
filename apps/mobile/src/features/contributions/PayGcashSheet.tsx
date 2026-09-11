import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Camera, Check, AlertTriangle, Copy, QrCode as QrCodeIcon, Hash } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { SlideSheet } from '@/components/shared/SlideSheet';
import { semantic, intent } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { buildContributionReference } from '@/lib/qrPh';
import { useActiveGroup } from '@/context/GroupContext';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { useSubmitContribution } from './contributions.hooks';
import { useProofScan, confirmSubmitDespiteDuplicate } from './useProofScan';

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <Pressable onPress={onCopy} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 13 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="overline" color="muted" style={{ marginBottom: 3 }}>{label}</Text>
        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{value}</Text>
      </View>
      {copied ? <Check size={16} color={intent.success.text} /> : <Copy size={16} color={semantic.textMuted} />}
    </Pressable>
  );
}

function FlagRow({ label, tone }: { label: string; tone: 'warn' | 'danger' }) {
  const t = tone === 'danger' ? intent.danger : intent.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: t.soft, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 7 }}>
      <AlertTriangle size={14} color={t.text} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: t.text, lineHeight: 15.5 }}>{label}</Text>
    </View>
  );
}

interface PayGcashSheetProps {
  visible: boolean;
  onClose: () => void;
  cycleId: string;
  /** The amount due for this specific period — fixed, not editable in the sheet. */
  amount: number;
  dueDate?: Date | null;
  /** Called after a successful submit (sheet is left open until then, so a failure can be corrected in place). */
  onSubmitted: () => void;
}

/**
 * The "Pay with GCash" pull-up sheet — scan/copy the treasurer's GCash
 * details, attach a receipt (auto-read via OCR), submit for an officer to
 * confirm. Self-contained (reads groupId/group/membership itself via
 * useActiveGroup) so any screen inside a [groupId] route can drop it in
 * with just the period being paid — see contributions/contribute.tsx and
 * contributions/index.tsx for the two current call sites.
 */
export function PayGcashSheet({ visible, onClose, cycleId, amount, dueDate, onSubmitted }: PayGcashSheetProps) {
  const { groupId, group, membership } = useActiveGroup();
  const submit = useSubmitContribution(groupId!);
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const qrImageUrl = useSignedProofUrl(group?.treasurer_gcash_qr_url);

  const { scanning, flags, scanMeta, scanProof, reset: resetScan } = useProofScan({
    groupId,
    expectedAmount: amount,
    treasurerGcashNumber: group?.treasurer_gcash_number,
    onFields: (fields) => {
      if (fields.reference) setReference(fields.reference);
    },
  });

  const qrReference = useMemo(
    () => (group && membership ? buildContributionReference({ fundCode: group.fund_code, membershipId: membership.id, when: dueDate ?? new Date() }) : ''),
    // `new Date()` fallback deliberately excluded from deps — see contribute.tsx's identical note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group?.fund_code, membership?.id, dueDate]
  );

  async function copyValue(key: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 1500);
  }

  async function pickProof() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach proof.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled) return;
    const uri = res.assets[0].uri;
    setProofUri(uri);
    // No receipt yet -> no reference to submit; a fresh pick always starts
    // from blank so a re-scan's result (or its absence) is never confused
    // with whatever the previous photo left behind.
    setReference('');
    resetScan();
    scanProof(uri);
  }

  async function onSubmit() {
    if (!groupId) return;
    if (!proofUri) return Alert.alert('Receipt required', "Attach your GCash receipt so an officer can verify it before it's posted.");
    const amt = toAmountString(String(amount));
    if (!amt) return;

    const proceed = await confirmSubmitDespiteDuplicate(groupId, reference, !!flags);
    if (!proceed) return;

    setUploading(true);
    try {
      let proof_url: string | undefined;
      if (proofUri) proof_url = await uploadImage('proofs', proofUri, 'contribution');
      const ok = await submit.run({ cycle_id: cycleId, amount: amt, payment_method: 'gcash', external_reference: reference || undefined, proof_url });
      if (ok !== undefined) {
        Alert.alert('Submitted', 'Your contribution was submitted for confirmation.');
        setReference('');
        setProofUri(null);
        resetScan();
        onSubmitted();
      } else if (submit.error) {
        Alert.alert('Could not submit', submit.error.message);
      }
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SlideSheet value={visible ? {} : null} onClose={onClose}>
      {() => (
        // flexShrink lets this actually scroll once content exceeds the
        // sheet's maxHeight — without it, Yoga never shrinks a ScrollView
        // below its content size, so the sheet's own cap just clips the
        // bottom (submit/cancel buttons) instead of making it scrollable.
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text variant="h2" style={{ fontSize: 18 }}>Pay with GCash</Text>
          <Text variant="body" color="secondary" style={{ marginTop: 5, lineHeight: 19 }}>
            Scan the QR in GCash, or copy the details below. The money goes straight to the treasurer — KapitPondo never holds it.
          </Text>

          {group?.treasurer_gcash_qr_url ? (
            <>
              <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 16 }}>
                {qrImageUrl ? (
                  <Image source={{ uri: qrImageUrl }} style={{ width: 200, height: 200, borderRadius: 8 }} resizeMode="contain" />
                ) : (
                  <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={semantic.brand} />
                  </View>
                )}
              </View>
              <Text variant="caption" color="muted" style={{ textAlign: 'center', marginTop: 8 }}>The Treasurer's own GCash QR — scan it directly in the GCash app</Text>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13, marginTop: 16 }}>
              <QrCodeIcon size={20} color={semantic.textMuted} />
              <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 16 }}>No QR uploaded for this group yet — use the details below to pay.</Text>
            </View>
          )}

          <View style={{ marginTop: 14, gap: 7 }}>
            <CopyRow
              label={`Recipient · ${group?.treasurer_gcash_name || 'Treasurer GCash'}`}
              value={group?.treasurer_gcash_number ?? ''}
              copied={copiedField === 'number'}
              onCopy={() => copyValue('number', group?.treasurer_gcash_number ?? '')}
            />
            <CopyRow
              label="Amount"
              value={formatPeso(amount)}
              copied={copiedField === 'amount'}
              onCopy={() => copyValue('amount', amount.toFixed(2))}
            />
            <CopyRow
              label="Reference · put in the message field"
              value={qrReference}
              copied={copiedField === 'ref'}
              onCopy={() => copyValue('ref', qrReference)}
            />
          </View>

          {!scanning && scanMeta ? (
            <View style={{ marginTop: 14 }}>
              {flags?.amountMismatch ? <FlagRow tone="warn" label={`Amount doesn't match the ${formatPeso(amount)} due — double-check before submitting.`} /> : null}
              {flags?.recipientMismatch ? <FlagRow tone="danger" label="Doesn't look like it was sent to the treasurer's GCash number." /> : null}
              {flags?.duplicateRef ? <FlagRow tone="danger" label="This reference is already attached to another contribution here." /> : null}
            </View>
          ) : null}

          <Pressable
            onPress={pickProof}
            disabled={scanning}
            style={{ borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 16, backgroundColor: semantic.surfaceAlt, marginTop: 14, overflow: 'hidden' }}
          >
            {proofUri ? (
              <View>
                <Image source={{ uri: proofUri }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
                {scanning ? (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,20,22,0.55)', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Reading your receipt…</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 7, paddingVertical: 18 }}>
                <Camera size={22} color={semantic.brandDark} />
                <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Attach your receipt to continue</Text>
                <Text variant="caption" color="muted">Screenshot or photo · JPG or PNG</Text>
              </View>
            )}
          </Pressable>

          <View style={{ marginTop: 14 }}>
            <Field
              label="Reference number"
              placeholder={proofUri ? 'Read from your receipt' : 'Attach a receipt first'}
              value={reference}
              onChangeText={setReference}
              editable={!!proofUri}
              style={!proofUri ? { opacity: 0.5 } : undefined}
              leading={<Hash size={18} color={semantic.textMuted} />}
            />
          </View>

          <Button
            label="I've paid — submit for approval"
            onPress={onSubmit}
            loading={submit.loading || uploading}
            disabled={!proofUri}
            style={{ marginTop: 2 }}
          />
          <Button label="Cancel" variant="ghost" onPress={onClose} style={{ marginTop: 8 }} />
        </ScrollView>
      )}
    </SlideSheet>
  );
}
