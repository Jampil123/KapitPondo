/**
 * app/(app)/[groupId]/expenses/record.tsx — Treasurer (or Owner) records a
 * group expense. Redesigned per the "treasurer-expenses" reference, with one
 * real difference: the mockup's per-Treasurer spending limit that routes
 * over-threshold expenses to the Owner for authorization has NO backend
 * support at all — checked expenses.routes.js/service.js and the schema
 * before building, there's no limit column, no threshold check, no
 * authorization stage. Dropped entirely rather than faked; it's the same
 * real record → a-different-officer-approves flow as contributions/loan
 * repayments (and unlike those, expenses already used this correctly — no
 * instant-post bug to fix here).
 *
 * Also dropped for the same reason (no backing column, migration 0046
 * confirmed): a distinct "date paid," a separate "paid to" field, and a
 * separate "note for the verifier" — there's only one `description` column.
 *
 * Real fixes applied alongside this redesign (migration 0046): expenses now
 * have `rejection_reason` (previously missing entirely), a reject
 * self-check (previously absent), and the same Treasurer-recorded-needs-
 * Auditor rule contributions/loan repayments already got.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Image, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X, Receipt, FileText, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { PillTabs } from '@/components/ui/PillTabs';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { useSummary } from '@/features/reporting/reporting.hooks';
import { useExpenses, useRecordExpense, useApproveExpense, useRejectExpense } from '@/features/expenses/expenses.hooks';
import type { Expense } from '@/api/expenses';

type Tab = 'record' | 'confirm' | 'awaiting' | 'posted' | 'returned';

const CATEGORIES = ['Printing', 'Load & data', 'Meeting', 'Supplies', 'Other'];
const cardStyle = [{ backgroundColor: semantic.surface, borderRadius: 20 }, shadowToken.card] as const;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Notice({ tone, title, body }: { tone: 'info' | 'danger'; title: string; body: string }) {
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: t.soft, borderRadius: 16, padding: 14 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.base, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <AlertTriangle size={12} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 12.5, color: t.text }}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{body}</Text>
      </View>
    </View>
  );
}

export default function RecordExpense() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { role } = useActiveGroup();
  const { member } = useAuth();
  const [tab, setTab] = useState<Tab>('record');

  const summary = useSummary(groupId!);
  const list = useExpenses(groupId!, {});
  const record = useRecordExpense(groupId!);
  const approve = useApproveExpense(groupId!);
  const reject = useRejectExpense(groupId!);

  const rows = list.data ?? [];
  // Recorded by someone ELSE, still needs an owner/auditor to confirm it — the
  // only role that can act here is owner/auditor (record()'s approve route),
  // but it's shown to whoever's looking so a Treasurer can at least see what's
  // outstanding; the server enforces who can actually tap Confirm.
  const needsConfirmRows = rows.filter((e) => e.status === 'submitted' && e.recorded_by !== member?.id);
  const awaitingRows = rows.filter((e) => e.status === 'submitted' && e.recorded_by === member?.id);
  const postedRows = rows.filter((e) => e.status === 'approved');
  const returnedRows = rows.filter((e) => e.status === 'rejected' && e.recorded_by === member?.id);

  const confirmsAsAuditor = role === 'treasurer'; // the real rule (migration 0046) only kicks in when the recorder is specifically a Treasurer

  // ---- Record new form ----
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickReceipt() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to attach a receipt.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) setProofUri(res.assets[0].uri);
  }

  async function onSave() {
    const amt = toAmountString(amount);
    if (!description.trim() || !amt) return Alert.alert('Missing info', 'Enter a description and a valid amount.');
    if (!proofUri) return Alert.alert('Receipt needed', 'Attach a receipt before recording — every expense needs proof.');
    setSaving(true);
    try {
      const proof_url = await uploadImage('proofs', proofUri, 'expense');
      const ok = await record.run({ amount: amt, category, description: description.trim(), proof_url });
      if (ok !== undefined) {
        Alert.alert('Recorded', confirmsAsAuditor ? 'Expense recorded — the Auditor needs to confirm it before it posts.' : 'Expense recorded — another officer needs to confirm it before it posts.');
        setDescription(''); setAmount(''); setProofUri(null); list.refetch();
      } else if (record.error) Alert.alert('Could not record', record.error.message);
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---- Confirm/return someone else's recorded expense (owner/auditor) ----
  async function onApprove(e: Expense) {
    const ok = await approve.run(e.id);
    if (ok !== undefined) list.refetch();
    else if (approve.error) Alert.alert('Could not confirm', approve.error.message);
  }
  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  async function onRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    const ok = await reject.run(id, reason || undefined);
    if (ok !== undefined) list.refetch();
    else if (reject.error) Alert.alert('Could not return', reject.error.message);
  }
  const [viewProof, setViewProof] = useState<Expense | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Expenses" subtitle={role === 'owner' ? 'Organizer' : 'Treasurer'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }} keyboardShouldPersistTaps="handled">

        {/* ---------------- Summary ---------------- */}
        <View style={{ paddingHorizontal: 2, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Spent</Text>
            <View style={{ backgroundColor: semantic.surfaceAlt, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>{postedRows.length} expense{postedRows.length === 1 ? '' : 's'}</Text>
            </View>
          </View>
          {summary.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.dashCard, letterSpacing: -1, marginTop: 4 }}>{formatPeso(summary.data?.total_expenses)}</Text>
          )}
          <Text variant="body" color="secondary" style={{ marginTop: 6, fontSize: 12.5 }}>Reduces the profit shared at year-end</Text>

          <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>Cash on hand</Text>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, marginTop: 3 }}>{formatPeso(summary.data?.available_cash)}</Text>
            </View>
            <View style={{ flex: 1, paddingLeft: 13, borderLeftWidth: 1, borderColor: semantic.border }}>
              <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>Awaiting approval</Text>
              <Text style={{ fontSize: 15, fontFamily: 'Poppins_700Bold', color: intent.warning.text, marginTop: 3 }}>{rows.filter((e) => e.status === 'submitted').length}</Text>
            </View>
          </View>
        </View>

        <PillTabs<Tab>
          options={[
            { key: 'record', label: 'Record new' },
            { key: 'confirm', label: 'Needs confirmation', count: needsConfirmRows.length, hot: needsConfirmRows.length > 0 },
            { key: 'awaiting', label: 'Awaiting Auditor', count: awaitingRows.length },
            { key: 'posted', label: 'Posted' },
            { key: 'returned', label: 'Returned', count: returnedRows.length, hot: returnedRows.length > 0 },
          ]}
          value={tab}
          onChange={setTab}
        />

        {/* ================= RECORD NEW ================= */}
        {tab === 'record' && (
          <View style={{ marginTop: 16, gap: 16 }}>
            <View>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>What was it for</Text>
              <View style={[cardStyle, { padding: 13, gap: 13 }]}>
                <View>
                  <Text variant="overline" color="secondary" style={{ marginBottom: 6 }}>Description <Text style={{ color: intent.danger.text }}>*</Text></Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. printing of contribution slips, paid to Sunshine Printing"
                    placeholderTextColor={semantic.textMuted}
                    multiline
                    style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52, fontFamily: 'Poppins_500Medium', fontSize: 14, color: semantic.textPrimary }}
                  />
                  <Text variant="caption" color="secondary" style={{ marginTop: 6, lineHeight: 16 }}>Include who it was paid to — there's no separate field for it.</Text>
                </View>
                <View>
                  <Text variant="overline" color="secondary" style={{ marginBottom: 8 }}>Category</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    {CATEGORIES.map((c) => {
                      const active = category === c;
                      return (
                        <Pressable key={c} onPress={() => setCategory(c)} style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 20, backgroundColor: active ? semantic.brandDark : semantic.surfaceAlt, borderWidth: 1.5, borderColor: active ? semantic.brandDark : 'transparent' }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{c}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Amount</Text>
              <View style={[cardStyle, { padding: 13 }]}>
                <Text variant="overline" color="secondary" style={{ marginBottom: 6 }}>Amount <Text style={{ color: intent.danger.text }}>*</Text></Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 52 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textSecondary, marginRight: 6 }}>₱</Text>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={semantic.textMuted}
                    style={{ flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}
                  />
                </View>
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginBottom: 9 }}>Receipt <Text variant="caption" color="secondary">· required</Text></Text>
              <Pressable onPress={pickReceipt} style={[{ borderWidth: 2, borderStyle: 'dashed', borderColor: proofUri ? semantic.brandDark : intent.danger.base, borderRadius: 16, padding: 16, alignItems: 'center' }, cardStyle]}>
                {proofUri ? (
                  <Image source={{ uri: proofUri }} style={{ width: '100%', height: 150, borderRadius: 10 }} resizeMode="cover" />
                ) : (
                  <>
                    <Camera size={22} color={semantic.brand} />
                    <Text variant="label" style={{ fontSize: 12.5, marginTop: 7 }}>Attach the receipt</Text>
                    <Text variant="caption" color="secondary" style={{ marginTop: 3, textAlign: 'center', lineHeight: 15 }}>Every expense reduces what members receive, so each one needs proof</Text>
                  </>
                )}
              </Pressable>
            </View>

            <Notice
              tone="info"
              title="Recorded by you, verified by someone else"
              body={`Nothing posts to the ledger until ${confirmsAsAuditor ? 'the Auditor checks' : 'another officer checks'} it. You can't approve your own entry, and your name stays on it permanently.`}
            />

            <Button label="Record expense" onPress={onSave} loading={saving || record.loading} />
            <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: -8 }}>
              {confirmsAsAuditor ? 'Goes to the Auditor for verification' : 'Goes to another officer for verification'}
            </Text>
          </View>
        )}

        {/* ================= NEEDS CONFIRMATION ================= */}
        {tab === 'confirm' && (
          list.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
          needsConfirmRows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text variant="h3" style={{ fontSize: 16 }}>All caught up</Text>
              <Text variant="body" color="secondary">No expenses waiting on a confirmation.</Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 16 }}>
              {needsConfirmRows.map((e) => (
                <View key={e.id} style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
                  <View style={{ flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 0 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" style={{ fontSize: 14.5 }} numberOfLines={1}>{e.description ?? 'Expense'}</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>
                        {e.category ?? 'Other'} · recorded {timeAgo(e.created_at)}{e.recorder?.full_name ? ` by ${e.recorder.full_name}` : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(e.amount)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, padding: 14 }}>
                    {e.proof_signed_url ? (
                      <Pressable onPress={() => setViewProof(e)} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={16} color={semantic.brandDark} />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => setRejectTarget(e)} disabled={reject.loading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, borderColor: semantic.borderStrong }}>
                      <Text variant="label" style={{ fontSize: 13, color: semantic.textSecondary }}>Return</Text>
                    </Pressable>
                    <Pressable onPress={() => onApprove(e)} disabled={approve.loading} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 11, backgroundColor: semantic.brandDark }}>
                      <Text variant="label" style={{ fontSize: 13, color: '#fff' }}>Confirm</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2 }}>
                Only the Owner or Auditor can confirm — and never whoever recorded it.
              </Text>
            </View>
          )
        )}

        {/* ================= AWAITING AUDITOR ================= */}
        {tab === 'awaiting' && (
          <View style={{ marginTop: 16 }}>
            {list.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            awaitingRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing waiting</Text>
                <Text variant="body" color="secondary">Expenses you record show up here until they're confirmed.</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: intent.info.soft, borderRadius: 16, overflow: 'hidden' }}>
                {awaitingRows.map((e, i) => (
                  <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: i < awaitingRows.length - 1 ? 1 : 0, borderColor: 'rgba(44,110,155,0.13)' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(44,110,155,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: intent.info.text }}>₱</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" style={{ fontSize: 13, color: intent.info.text }} numberOfLines={1}>{e.description ?? 'Expense'}</Text>
                      <Text variant="caption" style={{ marginTop: 2, color: intent.info.text, opacity: 0.75 }}>Recorded by you {timeAgo(e.created_at)} · {e.category ?? 'Other'}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.info.text }}>{formatPeso(e.amount)}</Text>
                  </View>
                ))}
                <Text variant="caption" style={{ padding: 13, paddingTop: 10, color: intent.info.text, opacity: 0.8, lineHeight: 16 }}>
                  It isn't counted against net income until an officer other than you confirms it.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ================= POSTED ================= */}
        {tab === 'posted' && (
          <View style={{ marginTop: 16 }}>
            {list.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            postedRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing posted yet</Text>
                <Text variant="body" color="secondary">Confirmed expenses show up here.</Text>
              </View>
            ) : (
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, shadowToken.card]}>
                {postedRows.map((e, i) => (
                  <Pressable key={e.id} onPress={() => e.proof_signed_url && setViewProof(e)} style={{ flexDirection: 'row', gap: 12, padding: 13, borderBottomWidth: i < postedRows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{e.description ?? 'Expense'}</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 3 }} numberOfLines={1}>
                        {shortDate(e.created_at)}{e.approver?.full_name ? ` · verified by ${e.approver.full_name}` : ''}
                      </Text>
                      <View style={{ alignSelf: 'flex-start', backgroundColor: semantic.surfaceAlt, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 7 }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark, textTransform: 'uppercase', letterSpacing: 0.4 }}>{e.category ?? 'Other'}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(e.amount)}</Text>
                      {e.proof_signed_url ? <FileText size={14} color={semantic.textMuted} style={{ marginTop: 6 }} /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2, marginTop: 12 }}>
              Once posted, an expense can&apos;t be edited. A mistake is fixed with a reversing entry.
            </Text>
          </View>
        )}

        {/* ================= RETURNED ================= */}
        {tab === 'returned' && (
          <View style={{ marginTop: 16 }}>
            {list.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
            returnedRows.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing returned</Text>
                <Text variant="body" color="secondary">Anything you recorded that gets sent back shows up here.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {returnedRows.map((e) => (
                  <View key={e.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden', borderLeftWidth: 4, borderLeftColor: intent.danger.base }, shadowToken.card]}>
                    {e.rejection_reason ? (
                      <View style={{ backgroundColor: intent.danger.soft, padding: 12, paddingBottom: 10 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.danger.text, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>Returned {shortDate(e.updated_at)}</Text>
                        <Text style={{ fontSize: 12, lineHeight: 17, color: '#8E3227', fontFamily: 'Poppins_500Medium' }}>{e.rejection_reason}</Text>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 8, padding: 13 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{e.description ?? 'Expense'}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Fix it and record it again</Text>
                      </View>
                      {e.proof_signed_url ? (
                        <Pressable onPress={() => setViewProof(e)} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={15} color={semantic.brandDark} />
                        </Pressable>
                      ) : null}
                      <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.textMuted }}>{formatPeso(e.amount)}</Text>
                    </View>
                  </View>
                ))}
                <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2 }}>
                  Nothing was posted, so there&apos;s nothing to reverse — correct it and send it back through.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Proof viewer */}
      <Modal visible={!!viewProof} transparent animationType="fade" onRequestClose={() => setViewProof(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewProof(null)}>
          <View style={{ width: '100%', backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>{viewProof?.description ?? 'Expense'}</Text>
                <Text variant="caption" color="secondary">{formatPeso(viewProof?.amount)}</Text>
              </View>
              <Pressable onPress={() => setViewProof(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {viewProof?.proof_signed_url ? (
              <Image source={{ uri: viewProof.proof_signed_url }} style={{ width: '100%', height: 360 }} resizeMode="contain" />
            ) : (
              <View style={{ height: 200, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={36} color={semantic.brand} />
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      <ReasonPrompt
        visible={!!rejectTarget}
        title={rejectTarget ? `Return "${rejectTarget.description ?? 'expense'}"?` : 'Return expense'}
        placeholder="What needs to be fixed? (visible to whoever recorded it)"
        confirmLabel="Return"
        destructive
        onCancel={() => setRejectTarget(null)}
        onConfirm={onRejectConfirm}
      />
    </SafeAreaView>
  );
}
