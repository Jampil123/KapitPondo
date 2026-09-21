import type { ReactNode } from 'react';
import { View, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Hash, Camera, Check, AlertTriangle, X, Copy, QrCode as QrCodeIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { semantic, intent, type IntentName } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import type { ProofFlags } from '@/features/contributions/useProofScan';

export function CloseHeader({ title, onClose }: { title?: string; onClose: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56 }}>
      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={20} color={semantic.textPrimary} />
      </Pressable>
      {title ? <Text variant="h3" style={{ fontSize: 16 }} numberOfLines={1}>{title}</Text> : null}
    </View>
  );
}

export function Badge({ tone, label, Icon }: { tone: IntentName; label: string; Icon: any }) {
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
      <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: t.strong, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={9} color="#fff" strokeWidth={2.6} />
      </View>
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

export function SectionHead({ title }: { title: string }) {
  return (
    <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 24, marginBottom: 10 }}>{title}</Text>
  );
}

/** The amount, front and centre, with its status and due date; the copy icon is only passed while the member still has to pay. */
export function AmountBlock({ label, amount, badge, meta, note, copied, onCopy }: {
  label: string; amount: number | string; badge: ReactNode; meta: ReactNode; note?: string; copied?: boolean; onCopy?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <Text variant="overline" color="muted">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.6 }}>{formatPeso(amount)}</Text>
        {onCopy ? (
          <Pressable onPress={onCopy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy amount">
            {copied ? <Check size={18} color={intent.success.text} /> : <Copy size={18} color={semantic.textMuted} />}
          </Pressable>
        ) : null}
      </View>
      <View style={{ marginTop: 10 }}>{badge}</View>
      <Text variant="body" color="secondary" style={{ marginTop: 10, fontSize: 12.5, textAlign: 'center' }}>{meta}</Text>
      {note ? <Text variant="caption" color="muted" style={{ marginTop: 3 }}>{note}</Text> : null}
    </View>
  );
}

/** A validation warning surfaced from the AI receipt read — flags, never blocks. */
function FlagRow({ label, tone }: { label: string; tone: 'warn' | 'danger' }) {
  const t = tone === 'danger' ? intent.danger : intent.warning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 8 }}>
      <AlertTriangle size={14} color={t.text} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: t.text, lineHeight: 15.5 }}>{label}</Text>
    </View>
  );
}

/** "Can't proceed yet" state — no-cycle / no-officer / no-gcash. */
export function BlockedState({ icon: Icon, tone, title, body }: { icon: any; tone: IntentName; title: string; body: string }) {
  const t = intent[tone];
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Icon size={26} color={t.text} />
      </View>
      <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, textAlign: 'center' }}>{title}</Text>
      <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 320 }}>{body}</Text>
    </View>
  );
}

function DetailRow({ label, value, copied, onCopy, last }: { label: string; value: string; copied: boolean; onCopy: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onCopy}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="overline" color="muted" style={{ marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{value}</Text>
      </View>
      {copied ? <Check size={16} color={intent.success.text} /> : <Copy size={16} color={semantic.textMuted} />}
    </Pressable>
  );
}

/** The treasurer's GCash QR plus copyable recipient and reference — what the member needs to pay. */
export function GcashDetails({ qrPath, recipientName, number, reference, copiedField, onCopy }: {
  qrPath: string | null | undefined; recipientName: string; number: string; reference: string;
  copiedField: string | null; onCopy: (key: string, value: string) => void;
}) {
  const qrUrl = useSignedProofUrl(qrPath);
  return (
    <>
      <SectionHead title="Pay with GCash" />
      {qrPath ? (
        <View style={{ alignItems: 'center' }}>
          {qrUrl ? (
            <Image source={{ uri: qrUrl }} style={{ width: 200, height: 200, borderRadius: 8 }} resizeMode="contain" />
          ) : (
            <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={semantic.brand} />
            </View>
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <QrCodeIcon size={20} color={semantic.textMuted} />
          <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 16 }}>No QR uploaded yet — use the details below.</Text>
        </View>
      )}
      <View style={{ marginTop: 6 }}>
        <DetailRow label={`Recipient · ${recipientName}`} value={number} copied={copiedField === 'number'} onCopy={() => onCopy('number', number)} />
        <DetailRow label="Reference · put in the message field" value={reference} copied={copiedField === 'ref'} onCopy={() => onCopy('ref', reference)} last />
      </View>
    </>
  );
}

export function PaymentForm({
  amount, setAmount, reference, setReference, proofUri, pickProof, scanning, flags, scanMeta, dueAmountLabel,
}: {
  amount: string; setAmount: (v: string) => void;
  reference: string; setReference: (v: string) => void;
  proofUri: string | null; pickProof: () => void;
  scanning?: boolean;
  flags?: ProofFlags | null;
  scanMeta?: { confidence: string; notes: string | null } | null;
  dueAmountLabel: string;
}) {
  return (
    <>
      <SectionHead title="Attach your receipt" />
      <Pressable
        onPress={pickProof}
        disabled={scanning}
        style={{ borderWidth: 1.6, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 16, overflow: 'hidden' }}
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
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
            <Camera size={24} color={semantic.brandDark} />
            <Text variant="bodySmall" color="secondary">Tap to attach a screenshot / photo</Text>
          </View>
        )}
      </Pressable>

      {!scanning && scanMeta ? (
        <View style={{ marginTop: 14 }}>
          {flags?.amountMismatch ? <FlagRow tone="warn" label={`The amount on the receipt doesn't match the ${dueAmountLabel} due — double-check before submitting.`} /> : null}
          {flags?.recipientMismatch ? <FlagRow tone="danger" label="This doesn't look like it was sent to the treasurer's GCash number — make sure you sent it to the right account." /> : null}
          {flags?.duplicateRef ? <FlagRow tone="danger" label="This reference number is already attached to another contribution in this group." /> : null}
          {scanMeta.confidence === 'low' ? <FlagRow tone="warn" label={scanMeta.notes ? `Hard to read clearly: ${scanMeta.notes}` : 'The photo was hard to read clearly — double-check the fields below.'} /> : null}
        </View>
      ) : null}

      <View style={{ gap: 14, marginTop: 16 }}>
        <Field label="Amount sent" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Field label="Reference number" placeholder="e.g. 9921 4456 7780" value={reference} onChangeText={setReference} leading={<Hash size={18} color={semantic.textMuted} />} />
      </View>
    </>
  );
}

export function SummaryRow({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <Text variant="caption" color="muted">{label}</Text>
      {typeof value === 'string' ? (
        <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, textAlign: 'right' }}>{value}</Text>
      ) : value}
    </View>
  );
}

/** "Jan 5, 2026, 3:04 PM" — a timestamp for success and detail pages. */
export function formatDateTime(date: Date) {
  const day = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${day}, ${date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Shown after a payment (contribution or loan repayment) is submitted; the header is the close icon alone. */
export function SuccessView({ heading, amount, note, rows, onClose, viewAllLabel, onViewAll }: {
  heading: string;
  amount: number | string;
  note: string;
  rows: { label: string; value: ReactNode }[];
  onClose: () => void;
  viewAllLabel: string;
  onViewAll: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader onClose={onClose} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', paddingTop: 20 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: intent.success.soft, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: intent.success.base, alignItems: 'center', justifyContent: 'center' }}>
              <Check size={28} color="#fff" strokeWidth={3} />
            </View>
          </View>
          <Text style={{ fontSize: 18, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 18 }}>{heading}</Text>
          <Text style={{ fontSize: 26, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.6, marginTop: 6 }}>{formatPeso(amount)}</Text>
          <Text variant="body" color="secondary" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>{note}</Text>
        </View>

        <View style={{ marginTop: 28 }}>
          {rows.map((r, i) => <SummaryRow key={r.label} label={r.label} value={r.value} last={i === rows.length - 1} />)}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
        <Button label="Done" onPress={onClose} />
        <Button label={viewAllLabel} variant="ghost" onPress={onViewAll} />
      </View>
    </SafeAreaView>
  );
}
