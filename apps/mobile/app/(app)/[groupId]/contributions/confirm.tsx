/**
 * app/(app)/[groupId]/contributions/confirm.tsx — treasurer confirms/records
 * contributions (M5). Pending tab: approve/reject submitted contributions
 * (real). Record tab: log a member's cash payment on their behalf.
 *
 * NOTE: recording on behalf sends membership_id — the API must accept it and
 * apply segregation of duties (a treasurer who records still needs a different
 * officer to approve).
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso, toAmountString } from '@/lib/money';
import { useQuery, useAction } from '@/hooks/useApi';
import { listMembers } from '@/api/groups';
import { submitContribution, type PaymentMethod } from '@/api/contributions';
import { useContributions, useApproveContribution, useRejectContribution } from '@/features/contributions/contributions.hooks';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';

type Tab = 'pending' | 'record';

function nameOf(c: any) { return c.member_name ?? c.members?.full_name ?? c.member?.full_name ?? 'Member'; }

export default function ConfirmContributions() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [tab, setTab] = useState<Tab>('pending');

  // ---- Pending confirmations ----
  const pending = useContributions(groupId!, { status: 'submitted' });
  const approve = useApproveContribution(groupId!);
  const reject = useRejectContribution(groupId!);

  async function onApprove(id: string) {
    const ok = await approve.run(id);
    if (ok !== undefined) pending.refetch();
    else if (approve.error) Alert.alert('Could not confirm', approve.error.message);
  }
  async function onReject(id: string) {
    const ok = await reject.run(id);
    if (ok !== undefined) pending.refetch();
    else if (reject.error) Alert.alert('Could not reject', reject.error.message);
  }

  // ---- Record on behalf ----
  const { cycle } = useActiveCycle(groupId!);
  const members = useQuery(() => listMembers(groupId!) as Promise<any[]>, [groupId]);
  const record = useAction((body: any) => submitContribution(groupId!, body));
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('Select member');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');

  const memberRows = useMemo(() => (Array.isArray(members.data) ? members.data : []).map((m: any) => ({
    id: m.id ?? m.member_id ?? m.membership_id,
    name: m.full_name ?? m.name ?? m.members?.full_name ?? 'Member',
  })), [members.data]);

  function pickMember() {
    if (memberRows.length === 0) return Alert.alert('No members', 'No active members to record for.');
    Alert.alert('Select member', undefined, [
      ...memberRows.slice(0, 10).map((m) => ({ text: m.name, onPress: () => { setMemberId(m.id); setMemberName(m.name); } })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  async function onRecord() {
    if (!cycle) return Alert.alert('No active cycle', 'There is no active cycle.');
    if (!memberId) return Alert.alert('Select a member', 'Choose who this contribution is for.');
    const amt = toAmountString(amount);
    if (!amt) return Alert.alert('Invalid amount', 'Enter a valid amount.');
    const ok = await record.run({ cycle_id: cycle.id, membership_id: memberId, amount: amt, payment_method: method, external_reference: reference || undefined });
    if (ok !== undefined) {
      Alert.alert('Recorded', 'Contribution recorded. It still needs a different officer to approve.');
      setAmount(''); setReference(''); setMemberId(null); setMemberName('Select member');
      setTab('pending'); pending.refetch();
    } else if (record.error) Alert.alert('Could not record', record.error.message);
  }

  const rows = pending.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Contributions" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Segmented<Tab> options={[{ key: 'pending', label: 'Pending', count: rows.length }, { key: 'record', label: 'Record new' }]} value={tab} onChange={setTab} />

        {tab === 'pending' ? (
          pending.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 20 }} /> :
          rows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text variant="h3" style={{ fontSize: 16 }}>All confirmed</Text>
              <Text variant="body" color="secondary">No contributions waiting.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {rows.map((c) => (
                <View key={c.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14 }, shadowToken.card]}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <Avatar name={nameOf(c)} size={44} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label" style={{ fontSize: 14.5 }}>{nameOf(c)}</Text>
                      {c.payment_method ? <StatusBadge entity="role" value="member" labelOverride={c.payment_method} /> : null}
                    </View>
                    <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(c.amount)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <Pressable onPress={() => onApprove(c.id)} disabled={approve.loading} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#E2F0E8', borderRadius: 12, paddingVertical: 11 }}>
                      <Check size={16} color="#3E8E66" strokeWidth={2.4} /><Text variant="label" style={{ color: '#3E8E66', fontSize: 13.5 }}>Confirm</Text>
                    </Pressable>
                    <Pressable onPress={() => onReject(c.id)} disabled={reject.loading} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#F7E5E5', borderRadius: 12, paddingVertical: 11 }}>
                      <X size={16} color="#C25C5E" strokeWidth={2.4} /><Text variant="label" style={{ color: '#C25C5E', fontSize: 13.5 }}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )
        ) : (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 16 }, shadowToken.card]}>
            <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 2 }}>Member</Text>
            <Pressable onPress={pickMember} style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 15 }}>
              <Text variant="body" style={{ color: memberId ? semantic.textPrimary : semantic.textMuted }}>{memberName}</Text>
            </Pressable>
            <Field label="Amount" prefix="₱" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={cycle ? String(cycle.contribution_amount) : '0'} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 15 }}>
              {(['cash', 'gcash', 'bank_transfer', 'other'] as PaymentMethod[]).map((m) => (
                <Pressable key={m} onPress={() => setMethod(m)} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: method === m ? semantic.textPrimary : semantic.surfaceAlt }}>
                  <Text variant="caption" style={{ color: method === m ? '#fff' : semantic.textSecondary }}>{m === 'bank_transfer' ? 'Bank' : m}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Reference number" placeholder="Optional for cash" value={reference} onChangeText={setReference} />
            <Button label="Record contribution" onPress={onRecord} loading={record.loading} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
