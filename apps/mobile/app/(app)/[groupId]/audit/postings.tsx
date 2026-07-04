/**
 * app/(app)/[groupId]/audit/postings.tsx — auditor verifies postings (M8).
 * Combines submitted contributions + expenses into one queue; the auditor
 * approves or rejects each (recorder != approver). Flagged tab has no backend
 * yet, so it's empty.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Modal, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, Minus, Receipt, X, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TabBar } from '@/components/ui/TabBar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useContributions, useApproveContribution, useRejectContribution } from '@/features/contributions/contributions.hooks';
import { useExpenses, useApproveExpense, useRejectExpense } from '@/features/expenses/expenses.hooks';

type Tab = 'pending' | 'approved' | 'flagged';
type Kind = 'contribution' | 'expense';
type Posting = { id: string; kind: Kind; who: string; date: string; amount: string | number; proof: boolean; status: string };

function cName(c: any) { return c.member_name ?? c.members?.full_name ?? c.member?.full_name ?? 'Member'; }

export default function ReviewPostings() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [tab, setTab] = useState<Tab>('pending');
  const [target, setTarget] = useState<Posting | null>(null);

  const contribs = useContributions(groupId!, {});
  const expenses = useExpenses(groupId!, {});
  const approveC = useApproveContribution(groupId!);
  const rejectC = useRejectContribution(groupId!);
  const approveE = useApproveExpense(groupId!);
  const rejectE = useRejectExpense(groupId!);

  const postings = useMemo<Posting[]>(() => {
    const c: Posting[] = (contribs.data ?? []).map((x: any) => ({ id: x.id, kind: 'contribution', who: cName(x), date: x.created_at ?? x.submitted_at ?? '', amount: x.amount, proof: !!x.proof_url, status: x.status }));
    const e: Posting[] = (expenses.data ?? []).map((x: any) => ({ id: x.id, kind: 'expense', who: x.description ?? 'Expense', date: x.created_at ?? '', amount: x.amount, proof: !!x.proof_url, status: x.status }));
    return [...c, ...e];
  }, [contribs.data, expenses.data]);

  const pendingCount = postings.filter((p) => p.status === 'submitted').length;
  const list = postings.filter((p) => (tab === 'pending' ? p.status === 'submitted' : tab === 'approved' ? p.status === 'approved' : false));
  const loading = contribs.loading || expenses.loading;

  function refetch() { contribs.refetch(); expenses.refetch(); }

  async function decide(p: Posting, approve: boolean) {
    const run = p.kind === 'contribution'
      ? (approve ? approveC.run(p.id) : rejectC.run(p.id))
      : (approve ? approveE.run(p.id) : rejectE.run(p.id));
    const ok = await run;
    setTarget(null);
    if (ok !== undefined) refetch();
    else Alert.alert('Action failed', 'Could not update this posting.');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Review Postings" subtitle="Auditor" />
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        <TabBar<Tab>
          options={[{ key: 'pending', label: 'Pending', count: pendingCount }, { key: 'approved', label: 'Approved' }, { key: 'flagged', label: 'Flagged' }]}
          value={tab}
          onChange={setTab}
        />

        {loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} /> :
        tab === 'flagged' ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 16 }}>No flagging yet</Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>Discrepancy flagging isn’t enabled on the server yet.</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
            <Text variant="h3" style={{ fontSize: 16 }}>Nothing here</Text>
            <Text variant="body" color="secondary">No {tab} postings.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 11, paddingBottom: 20 }}>
            {list.map((p) => (
              <Pressable key={`${p.kind}-${p.id}`} onPress={() => p.status === 'submitted' && setTarget(p)} style={[{ backgroundColor: semantic.surface, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, shadowToken.card]}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  {p.kind === 'contribution' ? <ArrowUpRight size={19} color="#3E8E66" /> : <Minus size={19} color="#C25C5E" />}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{p.who}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="caption" color="secondary">{p.kind}</Text>
                    {p.proof
                      ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Receipt size={12} color="#3E8E66" /><Text style={{ fontSize: 10.5, color: '#3E8E66', fontFamily: 'Poppins_600SemiBold' }}>proof</Text></View>
                      : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><X size={12} color="#C25C5E" /><Text style={{ fontSize: 10.5, color: '#C25C5E', fontFamily: 'Poppins_600SemiBold' }}>no proof</Text></View>}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={{ fontSize: 14.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(p.amount)}</Text>
                  {p.status === 'approved' ? <StatusBadge entity="expense" value="approved" /> : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Verify modal */}
      <Modal visible={!!target} transparent animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="h2" style={{ flex: 1, fontSize: 18 }}>Verify posting</Text>
              <Pressable onPress={() => setTarget(null)} hitSlop={8}><X size={22} color={semantic.textSecondary} /></Pressable>
            </View>
            {target && (
              <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 13, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label">{target.who}</Text>
                  <Text style={{ fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(target.amount)}</Text>
                </View>
                <Text variant="caption" color="secondary">{target.kind}{target.proof ? ' · proof attached' : ' · no proof'}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Reject" variant="ghost" onPress={() => target && decide(target, false)} style={{ flex: 1 }} />
              <Button label="Approve" leading={<Check size={16} color="#fff" />} onPress={() => target && decide(target, true)} loading={approveC.loading || approveE.loading} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
