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
import { useSubmitRepayment } from './lending.hooks';
import { useLoanProofScan, confirmLoanSubmitDespiteDuplicate } from './useProofScan';

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

/** A validation warning surfaced from the AI receipt read — flags, never blocks. */
function FlagRow({ label, tone }: { label: string; tone: 'warn' | 'danger' }) {
  const t = tone === 'danger' ? intent.danger : intent.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: t.soft, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 7 }}>
      <AlertTriangle size={14} color={t.text} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: t.text, lineHeight: 15.5 }}>{label}</Text>
    </View>
  );
}

interface PayLoanGcashSheetProps {
  visible: boolean;
  onClose: () => void;
  loanId: string;
  /** The outstanding balance — pre-filled but editable, since a partial repayment is fine. */
  suggestedAmount: number;
  /** Called after a successful submit (sheet is left open until then, so a failure can be corrected in place). */
  onSubmitted: () => void;
}

/**
 * The loan-repayment "Pay with GCash" pull-up sheet — scan/copy the
 * treasurer's GCash details, attach a receipt (auto-read via OCR, same as
 * contributions/PayGcashSheet.tsx), submit for an officer to confirm. Uses
 * useLoanProofScan (features/lending/useProofScan.ts) rather than
 * contributions' hook, since the duplicate-reference check has to query
 * loan_payments, not contributions.
 */
export function PayLoanGcashSheet({ visible, onClose, loanId, suggestedAmount, onSubmitted }: PayLoanGcashSheetProps) {
  const { groupId, group, membership } = useActiveGroup();
  const submit = useSubmitRepayment(groupId!);
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [reference, setReference] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const qrImageUrl = useSignedProofUrl(group?.treasurer_gcash_qr_url);

  const { scanning, flags, scanMeta, scanProof, reset: resetScan } = useLoanProofScan({
    groupId,
    // Compare the receipt against whatever's actually typed right now, not
    // the fixed initial suggestion — a member who deliberately pays a
    // different amount than suggested shouldn't get a false mismatch flag.
    expectedAmount: Number(toAmountString(amount)) || suggestedAmount,
    treasurerGcashNumber: group?.treasurer_gcash_number,
    onFields: (fields) => {
      // Deliberately NOT auto-filling `amount` from OCR — unlike `reference`
      // (which starts blank, so filling it is unambiguously helpful), amount
      // starts pre-filled with the member's own entry and a misread receipt
      // would silently clobber a correct value with no clear signal it
      // changed. A real ₱530 submission got silently overwritten to ₱1000
      // this way. `amountMismatch` below still warns if the receipt doesn't
      // match what's currently typed — it just never overwrites it.
      if (fields.reference) setReference(fields.reference);
    },
  });

  const qrReference = useMemo(
    () => (group && membership ? buildContributionReference({ fundCode: group.fund_code, membershipId: membership.id }) : ''),
    [group?.fund_code, membership?.id],
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
    setReference('');
    resetScan();
    scanProof(uri);
  }

  async function onSubmit() {
    const amt = toAmountString(amount);
    if (!amt || Number(amt) <= 0) return Alert.alert('Invalid amount', 'Enter a valid repayment amount.');
    if (!proofUri) return Alert.alert('Receipt required', "Attach your GCash receipt so an officer can verify it before it's posted.");

    if (groupId) {
      const proceed = await confirmLoanSubmitDespiteDuplicate(groupId, reference, !!flags);
      if (!proceed) return;
    }

    setUploading(true);
    try {
      const proof_url = await uploadImage('proofs', proofUri, 'repayment');
      const ok = await submit.run(loanId, { amount: amt, external_reference: reference || undefined, proof_url });
      if (ok !== undefined) {
        Alert.alert('Submitted', 'Your repayment was submitted for confirmation.');
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
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
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
              label="Reference · put in the message field"
              value={qrReference}
              copied={copiedField === 'ref'}
              onCopy={() => copyValue('ref', qrReference)}
            />
          </View>

          <View style={{ marginTop: 14 }}>
            <Field label="Amount to pay" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <Text variant="caption" color="muted" style={{ marginTop: 6 }}>
              Paying less than the full balance ({formatPeso(suggestedAmount)}) is fine — it goes to interest first, then principal.
            </Text>
          </View>

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

          {!scanning && scanMeta ? (
            <View style={{ marginTop: 14 }}>
              {flags?.amountMismatch ? <FlagRow tone="warn" label={`The amount on the receipt doesn't match the ${formatPeso(suggestedAmount)} suggested — double-check before submitting.`} /> : null}
              {flags?.recipientMismatch ? <FlagRow tone="danger" label="This doesn't look like it was sent to the treasurer's GCash number — make sure you sent it to the right account." /> : null}
              {flags?.duplicateRef ? <FlagRow tone="danger" label="This reference number is already attached to another repayment in this group." /> : null}
              {scanMeta.confidence === 'low' ? <FlagRow tone="warn" label={scanMeta.notes ? `Hard to read clearly: ${scanMeta.notes}` : 'The photo was hard to read clearly — double-check the fields below.'} /> : null}
            </View>
          ) : null}

          <View style={{ marginTop: 14 }}>
            <Field
              label="Reference number"
              placeholder="e.g. 9921 4456 7780"
              value={reference}
              onChangeText={setReference}
              leading={<Hash size={18} color={semantic.textMuted} />}
            />
          </View>

          <Button
            label="I've paid — submit for confirmation"
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
