import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Image, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, X, ScanLine, Receipt } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { readContributionProof } from '@/api/contributions';
import { readRepaymentProof } from '@/api/lending';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useSignoffQueue, type SignoffItem } from '@/features/signoff/signoff';
import { useSignoffActions, PRIMARY_LABEL, canSendBack, sendBackLabel } from '@/features/signoff/useSignoffActions';
import { itemMatch } from '@/features/audit/VerificationQueue';
import type { ProofField } from '@/features/signoff/proofMatch';

const METHOD: Record<string, string> = { gcash: 'E-wallet', paymongo: 'E-wallet', cash: 'Cash', bank_transfer: 'Bank transfer', other: 'Other' };

function recordedLine(i: SignoffItem) {
  if (!i.recordedAt) return null;
  const d = new Date(i.recordedAt);
  const today = new Date().toDateString() === d.toDateString();
  const when = `${today ? 'today' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`;
  return `${METHOD[i.method ?? ''] ?? 'Payment'}, recorded by ${i.recordedBy ?? i.name} ${when}`;
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 20, padding: 16 }, shadowToken.soft, style]}>{children}</View>;
}

function Title({ children }: { children: string }) {
  return <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 22, marginBottom: 9 }}>{children}</Text>;
}

/** One compared field: label on top, recorded ← mark → read. */
function CompareRow({ f, last }: { f: ProofField; last: boolean }) {
  const tone = f.state === 'match' ? intent.success : f.state === 'mismatch' ? intent.danger : null;
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 11.5, color: semantic.textSecondary, marginBottom: 4 }}>{f.label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={2}>{f.recorded}</Text>
        <View style={{ width: 24, height: 24, borderRadius: 12, marginHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: tone ? tone.soft : semantic.surfaceAlt }}>
          {f.state === 'match' ? <Check size={12} color={intent.success.text} strokeWidth={3} /> : f.state === 'mismatch' ? <X size={12} color={intent.danger.text} strokeWidth={3} /> : <Text style={{ fontSize: 11, color: semantic.textMuted }}>?</Text>}
        </View>
        <Text style={{ flex: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: f.state === 'unread' ? semantic.textMuted : f.state === 'mismatch' ? intent.danger.text : semantic.textPrimary }} numberOfLines={2}>{f.read}</Text>
      </View>
      {!last ? <View style={{ width: 2, height: 14, backgroundColor: intent.success.soft, marginTop: 4 }} /> : null}
    </View>
  );
}

export default function VerifyRecord() {
  const { groupId, key } = useLocalSearchParams<{ groupId: string; key: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queue = useSignoffQueue(groupId!);
  const { cycle } = useActiveCycle(groupId!);
  const actions = useSignoffActions(groupId!, () => { queue.refetch(); router.back(); });
  const [rejecting, setRejecting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const readRequested = useRef(false);

  const i = queue.items.find((x) => x.key === key && x.mine);
  const money = i && (i.kind === 'contribution' || i.kind === 'repayment');

  // Older records were never read: ask the server to read the proof now, once.
  useEffect(() => {
    if (!i || !money || !i.proofUrl || i.reading || readRequested.current) return;
    readRequested.current = true;
    const read = i.kind === 'contribution' ? readContributionProof(groupId!, i.id) : readRepaymentProof(groupId!, i.id);
    read.then(() => queue.refetch()).catch(() => {});
  }, [i, money, groupId, queue]);

  if (!i) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Record" backgroundColor={semantic.background} tintColor={semantic.textPrimary} />
        {queue.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40, paddingHorizontal: 24 }}>This one’s already been handled, or it isn’t yours to sign off.</Text>
        )}
      </SafeAreaView>
    );
  }

  const match = money ? itemMatch(i) : null;
  const fields = match && 'fields' in match ? match.fields : [];
  const allMatch = match?.kind === 'match' && fields.every((f) => f.state === 'match');

  // Rule check (contributions): heads × the cycle's contribution = what's due.
  const heads = queue.members.find((m) => m.id === i.membershipId)?.heads ?? 1;
  const due = i.kind === 'contribution' && cycle && (!i.cycleId || i.cycleId === cycle.id) ? heads * Number(cycle.contribution_amount) : null;
  const dueOk = due != null && i.amount != null && Math.abs(Number(i.amount) - due) < 0.5;
  const periodLabel = i.recordedAt ? new Date(i.recordedAt).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title={i.label} backgroundColor={semantic.background} tintColor={semantic.textPrimary} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{i.name}</Text>
        {i.amount !== null ? <Text style={{ fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>{formatPeso(i.amount)}</Text> : null}
        {money && recordedLine(i) ? <Text variant="caption" color="secondary">{recordedLine(i)}</Text> : null}

        {money ? (
          <>
            {/* Recorded vs read from proof */}
            <Card style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>Recorded</Text>
                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary }}>Read from proof</Text>
              </View>
              {match?.kind === 'no_proof' ? (
                <Text variant="caption" style={{ color: intent.danger.text, paddingVertical: 8 }}>No proof attached — check this one against the cash slip or receipt number.</Text>
              ) : match?.kind === 'pending' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color={semantic.brand} />
                  <Text variant="caption" color="secondary">Reading the proof…</Text>
                </View>
              ) : (
                <>
                  {fields.map((f, idx) => <CompareRow key={f.key} f={f} last={idx === fields.length - 1} />)}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderStyle: 'dashed', borderColor: semantic.border }}>
                    {match?.kind === 'mismatch' ? <X size={14} color={intent.danger.text} strokeWidth={3} /> : <Check size={14} color={allMatch ? intent.success.text : semantic.textMuted} strokeWidth={3} />}
                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: match?.kind === 'mismatch' ? intent.danger.text : allMatch ? intent.success.text : semantic.textSecondary }}>
                      {match?.kind === 'mismatch'
                        ? `${match.count} field${match.count === 1 ? '' : 's'} ${match.count === 1 ? "doesn't" : "don't"} match the proof`
                        : allMatch ? `All ${fields.length} fields match the proof`
                          : match?.kind === 'match' ? 'The fields read match — check the rest by eye' : "The proof couldn't be read — check it by eye"}
                    </Text>
                  </View>
                </>
              )}
            </Card>

            {/* The proof itself */}
            {i.proofUrl ? (
              <>
                <Title>Uploaded proof</Title>
                <Card>
                  <Pressable onPress={() => setViewing(true)} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: semantic.surfaceAlt }}>
                    <Image source={{ uri: i.proofUrl }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
                  </Pressable>
                  {fields.some((f) => f.state !== 'unread') ? (
                    <View style={{ marginTop: 12 }}>
                      {fields.filter((f) => f.state !== 'unread').map((f) => (
                        <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderColor: semantic.border }}>
                          <Text style={{ fontSize: 12.5, color: semantic.textSecondary }}>{f.label === 'Paid by' ? 'Sent by' : f.label}</Text>
                          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: semantic.brand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{f.read}</Text>
                          </View>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                        <ScanLine size={12} color={semantic.textMuted} />
                        <Text variant="caption" color="muted" style={{ flex: 1 }}>Outlined fields were read automatically from the uploaded proof.</Text>
                      </View>
                    </View>
                  ) : null}
                </Card>
              </>
            ) : null}

            {/* Rule check */}
            {due != null ? (
              <>
                <Title>Rule check</Title>
                <Card>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dueOk ? intent.success.soft : intent.danger.base, marginTop: 1 }}>
                      {dueOk ? <Check size={12} color={intent.success.text} strokeWidth={3} /> : <X size={12} color="#fff" strokeWidth={3} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{dueOk ? 'Matches what is due' : "Doesn't match what is due"}</Text>
                      <Text variant="caption" style={{ color: dueOk ? semantic.textSecondary : intent.danger.text, marginTop: 1 }}>
                        {heads} head{heads === 1 ? '' : 's'} × {formatPeso(cycle!.contribution_amount)} = {formatPeso(due)}{periodLabel ? ` for ${periodLabel}` : ''}
                      </Text>
                    </View>
                  </View>
                </Card>
              </>
            ) : null}
          </>
        ) : (
          i.note ? (
            <Card style={{ marginTop: 14 }}>
              <Text variant="caption" color="secondary" style={{ marginBottom: 4 }}>{i.kind === 'reversal' ? 'Reason for the reversal' : 'Purpose'}</Text>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: semantic.textPrimary }}>{i.note}</Text>
            </Card>
          ) : null
        )}

        {!i.proofUrl && money ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
            <Receipt size={13} color={semantic.textMuted} />
            <Text variant="caption" color="muted">{i.reference ? `Receipt no. ${i.reference}` : 'No receipt number'}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Reject / step */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4, flexDirection: 'row', gap: 10 }}>
        {canSendBack(i) ? (
          <Pressable onPress={() => setRejecting(true)} disabled={actions.busy} style={{ flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: semantic.surface, borderWidth: 1, borderColor: intent.danger.soft }}>
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>{sendBackLabel(i)}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => actions.approve(i)} disabled={actions.busy} style={{ flex: 1.6, paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: semantic.brandDark, opacity: actions.busy ? 0.6 : 1 }}>
          {actions.busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{PRIMARY_LABEL[i.action]}</Text>}
        </Pressable>
      </View>

      <ReasonPrompt
        visible={rejecting}
        title={i.action === 'review' ? `Send ${i.name}'s loan back?` : `Reject ${i.name}'s ${i.label.toLowerCase()}?`}
        placeholder={i.action === 'review' ? 'Why it needs another look (required)' : 'Reason (shown to them)'}
        confirmLabel={sendBackLabel(i)}
        destructive
        onCancel={() => setRejecting(false)}
        onConfirm={(reason) => { setRejecting(false); actions.sendBack(i, reason); }}
      />
      <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewing(false)}>
          {i.proofUrl ? <Image source={{ uri: i.proofUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
