/**
 * app/(app)/[groupId]/audit/proofs.tsx — the Auditor's proof review screen.
 * Redesigned per the "auditor-proofs" reference. Checked before building:
 *
 *   - Flag and "Ask for proof" had NO backend at all — added for real
 *     (services/api/src/modules/auditlog: flagPosting/askForProof). Flag
 *     writes to audit_log + notifies the Owner; it does NOT touch the
 *     ledger — a real correction still goes through the reversal workflow
 *     (ledger.routes.js) with all three officers, same as before.
 *   - Loan DISBURSEMENTS have no proof_url column at all (checked the loans
 *     table) and no separate "verifier" distinct from the Treasurer/Owner
 *     who disbursed it — proof structurally doesn't apply to them, so
 *     they're not part of this screen. Contributions, expenses, and loan
 *     REPAYMENTS are the three real proof-bearing postings.
 *   - "posted without proof" is a real, reachable state — proof_url is
 *     optional at insert time for all three (checked each insert/RPC).
 *
 * No unified "all proofs" endpoint exists server-side, so this merges three
 * already-fetched lists client-side, same as the screen it replaces did for
 * two of them.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Search, Rows3, LayoutGrid, X, Receipt, Flag } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PillTabs } from '@/components/ui/PillTabs';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useExpenses } from '@/features/expenses/expenses.hooks';
import { useRepayments } from '@/features/lending/lending.hooks';
import { useFlagPosting, useAskForProof } from '@/features/auditlog/auditlog.hooks';
import type { ProofEntityType } from '@/api/auditLog';

type ViewMode = 'list' | 'grid';
type FilterKey = 'all' | 'none' | 'contribution' | 'loan_payment' | 'expense';

interface ProofItem {
  id: string;
  entityType: ProofEntityType;
  title: string;
  subtitle: string;
  amount: string | number;
  date: string;
  proofUrl: string | null;
  recordedByName: string | null;
  recordedById: string | null;
  verifiedByName: string | null;
  posted: boolean;
  outcome: 'posted' | 'rejected' | 'pending';
}

function cName(c: any): string { return c.memberships?.members?.full_name ?? 'Member'; }
function pName(p: any): string { return p.loans?.membership?.members?.full_name ?? 'Member'; }
function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function ReviewProofs() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const contribs = useContributions(groupId!, {});
  const expenses = useExpenses(groupId!, {});
  const repayments = useRepayments(groupId!);
  const flag = useFlagPosting(groupId!);
  const ask = useAskForProof(groupId!);

  const loading = contribs.loading || expenses.loading || repayments.loading;

  const items: ProofItem[] = useMemo(() => {
    const cs: ProofItem[] = (contribs.data ?? []).map((c) => ({
      id: c.id, entityType: 'contribution', title: `Contribution · ${cName(c)}`,
      subtitle: `${c.external_reference ? `ref ${c.external_reference}` : 'no reference'}`,
      amount: c.amount, date: c.created_at, proofUrl: c.proof_signed_url,
      recordedByName: c.recorder?.full_name ?? null, recordedById: c.recorded_by,
      verifiedByName: c.approver?.full_name ?? null,
      posted: c.status === 'approved',
      outcome: c.status === 'approved' ? 'posted' : c.status === 'rejected' ? 'rejected' : 'pending',
    }));
    const es: ProofItem[] = (expenses.data ?? []).map((e) => ({
      id: e.id, entityType: 'expense', title: `Expense · ${e.description ?? 'Expense'}`,
      subtitle: e.category ?? 'Other',
      amount: e.amount, date: e.created_at, proofUrl: e.proof_signed_url,
      recordedByName: e.recorder?.full_name ?? null, recordedById: e.recorded_by,
      verifiedByName: e.approver?.full_name ?? null,
      posted: e.status === 'approved',
      outcome: e.status === 'approved' ? 'posted' : e.status === 'rejected' ? 'rejected' : 'pending',
    }));
    const ps: ProofItem[] = (repayments.data ?? []).map((p) => ({
      id: p.id, entityType: 'loan_payment', title: `Repayment · ${pName(p)}`,
      subtitle: p.status === 'paid' ? `${formatPeso(p.interest_portion)} interest` : 'Loan repayment',
      amount: p.amount, date: p.created_at, proofUrl: p.proof_signed_url,
      recordedByName: p.recorder?.full_name ?? null, recordedById: p.recorded_by,
      verifiedByName: p.verifier?.full_name ?? null,
      posted: p.status === 'paid',
      outcome: p.status === 'paid' ? 'posted' : p.status === 'rejected' ? 'rejected' : 'pending',
    }));
    return [...cs, ...es, ...ps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [contribs.data, expenses.data, repayments.data]);

  const missingProof = useMemo(() => items.filter((i) => i.posted && !i.proofUrl), [items]);
  const totalPosted = items.filter((i) => i.posted).length;
  const withProof = items.filter((i) => i.posted && i.proofUrl).length;

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'none') list = missingProof;
    else if (filter !== 'all') list = list.filter((i) => i.entityType === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        i.title.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q) ||
        String(i.amount).includes(q) ||
        (i.recordedByName ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filter, missingProof, search]);

  const [flagTarget, setFlagTarget] = useState<ProofItem | null>(null);
  async function onFlagConfirm(note: string) {
    if (!flagTarget) return;
    const target = flagTarget;
    setFlagTarget(null);
    const ok = await flag.run({ entity_type: target.entityType, entity_id: target.id, note: note || undefined, label: `${target.title} · ${formatPeso(target.amount)}` });
    if (ok === undefined && flag.error) Alert.alert('Could not flag', flag.error.message);
  }

  function onAsk(item: ProofItem) {
    if (!item.recordedById) return;
    Alert.alert('Ask for proof', `Ask ${item.recordedByName ?? 'the recorder'} to attach a receipt for this entry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ask', onPress: async () => {
          const ok = await ask.run({ entity_type: item.entityType, entity_id: item.id, recorded_by: item.recordedById!, label: `${item.title} · ${formatPeso(item.amount)}` });
          if (ok === undefined && ask.error) Alert.alert('Could not send', ask.error.message);
          else Alert.alert('Sent', `${item.recordedByName ?? 'They'} will be notified.`);
        },
      },
    ]);
  }

  const [viewProof, setViewProof] = useState<ProofItem | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar
        title="Proofs"
        subtitle={`${items.length} postings · ${withProof} with proof`}
        right={
          <View style={{ flexDirection: 'row', gap: 3, backgroundColor: semantic.surfaceAlt, borderRadius: 11, padding: 3 }}>
            <Pressable onPress={() => setView('list')} style={{ width: 30, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: view === 'list' ? semantic.surface : 'transparent' }}>
              <Rows3 size={15} color={semantic.brandDark} />
            </Pressable>
            <Pressable onPress={() => setView('grid')} style={{ width: 30, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: view === 'grid' ? semantic.surface : 'transparent' }}>
              <LayoutGrid size={15} color={semantic.brandDark} />
            </Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }} keyboardShouldPersistTaps="handled">

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 14, paddingHorizontal: 14, height: 46 }}>
          <Search size={16} color={semantic.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by member, amount or reference"
            placeholderTextColor={semantic.textMuted}
            style={{ flex: 1, fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}
          />
        </View>

        <View style={{ marginTop: 13 }}>
          <PillTabs<FilterKey>
            options={[
              { key: 'all', label: 'All' },
              { key: 'none', label: 'No proof', count: missingProof.length, hot: missingProof.length > 0 },
              { key: 'contribution', label: 'Contributions' },
              { key: 'loan_payment', label: 'Repayments' },
              { key: 'expense', label: 'Expenses' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>

        {loading && items.length === 0 ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : (
          <>
            {missingProof.length > 0 ? (
              <View style={{ backgroundColor: intent.danger.soft, borderRadius: 20, overflow: 'hidden', marginTop: 20 }}>
                <View style={{ flexDirection: 'row', gap: 11, padding: 14 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: intent.danger.base, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: '#fff' }}>!</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: intent.danger.text }}>These reached the ledger with nothing attached</Text>
                    <Text style={{ fontSize: 11.5, lineHeight: 16, color: '#A85A4C', fontFamily: 'Poppins_500Medium', marginTop: 3 }}>
                      Ask the officer who recorded it to supply one, or flag the entry for the Owner.
                    </Text>
                  </View>
                </View>
                {missingProof.map((i, idx) => (
                  <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, backgroundColor: 'rgba(255,255,255,0.6)', borderTopWidth: 1, borderColor: 'rgba(192,57,43,0.12)' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: '#8E3227' }} numberOfLines={1}>{i.title}</Text>
                      <Text style={{ fontSize: 11, color: '#A85A4C', fontFamily: 'Poppins_500Medium', marginTop: 2 }} numberOfLines={1}>
                        {i.recordedByName ? `Recorded by ${i.recordedByName} · ` : ''}{shortDate(i.date)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: '#8E3227' }}>{formatPeso(i.amount)}</Text>
                    <Pressable onPress={() => onAsk(i)} disabled={ask.loading} style={{ backgroundColor: intent.danger.base, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 11 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Ask</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>Nothing here</Text>
                <Text variant="body" color="secondary">No postings match this view.</Text>
              </View>
            ) : view === 'list' ? (
              <View>
                <Text variant="overline" color="muted" style={{ marginTop: 22, marginBottom: 10, marginLeft: 4 }}>All proofs · newest first</Text>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, overflow: 'hidden' }, shadowToken.card]}>
                  {filtered.map((i, idx) => (
                    <View key={i.id} style={{ flexDirection: 'row', gap: 12, padding: 13, borderBottomWidth: idx < filtered.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <Pressable onPress={() => i.proofUrl && setViewProof(i)} style={{ width: 48, height: 48, borderRadius: 13, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                        {i.proofUrl ? <Receipt size={18} color={semantic.brandDark} /> : <Receipt size={18} color={semantic.textMuted} strokeWidth={1.5} />}
                      </Pressable>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{i.title}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>{i.subtitle}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
                          <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: semantic.textSecondary }}>Recorded <Text style={{ color: semantic.textPrimary }}>{i.recordedByName ?? '—'}</Text></Text>
                          </View>
                          {i.outcome === 'posted' ? (
                            <View style={{ backgroundColor: intent.success.soft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>Verified {i.verifiedByName ?? ''}</Text>
                            </View>
                          ) : i.outcome === 'rejected' ? (
                            <View style={{ backgroundColor: intent.danger.soft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.danger.text }}>Returned</Text>
                            </View>
                          ) : (
                            <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: semantic.textSecondary }}>Not yet verified</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: semantic.dashCard }}>{formatPeso(i.amount)}</Text>
                          <Text variant="caption" color="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{shortDate(i.date)}</Text>
                        </View>
                        {i.outcome === 'posted' ? (
                          <Pressable onPress={() => setFlagTarget(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: semantic.borderStrong, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 9 }}>
                            <Flag size={11} color={semantic.textSecondary} />
                            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: semantic.textSecondary }}>Flag</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 22 }}>
                <Text variant="overline" color="muted" style={{ marginBottom: 10, marginLeft: 4 }}>{filtered.length} entries</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {filtered.map((i) => (
                    <Pressable key={i.id} onPress={() => i.proofUrl && setViewProof(i)} style={[{ width: '31%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }, shadowToken.card]}>
                      {i.proofUrl ? (
                        <Image source={{ uri: i.proofUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Receipt size={20} color={semantic.textMuted} strokeWidth={1.5} />
                        </View>
                      )}
                      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, backgroundColor: 'rgba(9,32,42,0.72)' }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#fff' }} numberOfLines={1}>{formatPeso(i.amount)}</Text>
                      </View>
                      <View style={{ position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: i.outcome === 'posted' ? intent.success.base : i.outcome === 'rejected' ? intent.danger.base : intent.info.base }}>
                        <Text style={{ fontSize: 8, color: '#fff' }}>{i.outcome === 'posted' ? '✓' : i.outcome === 'rejected' ? '×' : '…'}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        <Text variant="caption" color="muted" style={{ lineHeight: 16, paddingHorizontal: 2, marginTop: 18 }}>
          Proofs are read-only. Flagging one records a concern and notifies the Owner — it doesn&apos;t change the ledger, which can only be corrected by a reversing entry.
        </Text>
      </ScrollView>

      <Modal visible={!!viewProof} transparent animationType="fade" onRequestClose={() => setViewProof(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 }} onPress={() => setViewProof(null)}>
          <View style={{ width: '100%', backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>{viewProof?.title}</Text>
                <Text variant="caption" color="secondary">{formatPeso(viewProof?.amount ?? 0)}</Text>
              </View>
              <Pressable onPress={() => setViewProof(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {viewProof?.proofUrl ? (
              <Image source={{ uri: viewProof.proofUrl }} style={{ width: '100%', height: 360 }} resizeMode="contain" />
            ) : (
              <View style={{ height: 200, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={36} color={semantic.brand} />
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      <ReasonPrompt
        visible={!!flagTarget}
        title={flagTarget ? `Flag "${flagTarget.title}"?` : 'Flag posting'}
        placeholder="What's the concern? (visible to the Owner)"
        confirmLabel="Flag"
        destructive
        onCancel={() => setFlagTarget(null)}
        onConfirm={onFlagConfirm}
      />
    </SafeAreaView>
  );
}
