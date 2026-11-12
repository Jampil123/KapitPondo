/**
 * Hand over the group (UC-GM-10).
 *
 * Organizer:      choose an Active, Verified, non-officer member → reason → Send request,
 *                 then wait; can cancel until it's answered.
 * Chosen member:  Accept (becomes Organizer, the old one a regular member) or Decline.
 * The Organizer keeps the role until the member accepts; requests expire after 7 days.
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { Crown, Check, Clock3, Users, Coins, Undo2, CalendarClock } from 'lucide-react-native';
import { Alert } from '@/lib/alert';
import { toast } from '@/components/ui/Toast';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useQuery } from '@/hooks/useApi';
import { useActiveGroup, useGroups } from '@/context/GroupContext';
import { useAuth } from '@/context/AuthContext';
import {
  getHandover, getHandoverOptions, requestHandover, cancelHandover, acceptHandover, declineHandover,
  type HandoverCandidate, type HandoverRequest,
} from '@/api/groups';

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

function shortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 18, padding: 16 }, shadowToken.soft, style]}>{children}</View>;
}

function Title({ children }: { children: string }) {
  return <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 20, marginBottom: 9 }}>{children}</Text>;
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <Text style={{ fontSize: 12.5, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}

/** What the new Organizer takes over — the queues follow the role. */
function TaskList({ tasks }: { tasks?: { membership_requests: number; loan_requests: number; reversals: number; distribution: boolean } }) {
  const rows = [
    { Icon: Users, label: 'Membership requests', value: tasks ? String(tasks.membership_requests) : null },
    { Icon: Coins, label: 'Loan requests', value: tasks ? String(tasks.loan_requests) : null },
    { Icon: Undo2, label: 'Reversals to approve', value: tasks ? String(tasks.reversals) : null },
    { Icon: CalendarClock, label: 'Year-end distribution', value: tasks ? (tasks.distribution ? 'In progress' : 'None') : null },
  ];
  return (
    <Card style={{ paddingVertical: 6 }}>
      {rows.map((r, i) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
          <r.Icon size={15} color={semantic.brandDark} />
          <Text style={{ fontSize: 12.5, color: semantic.textSecondary }}>{r.label}</Text>
          {r.value != null ? <Text style={{ marginLeft: 'auto', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{r.value}</Text> : null}
        </View>
      ))}
    </Card>
  );
}

/** The request card both sides see. */
function RequestCard({ h, mine }: { h: HandoverRequest; mine: boolean }) {
  const toName = h.to?.full_name ?? 'Member';
  const fromName = h.by_sysadmin ? 'The system administrator' : h.from?.full_name ?? 'The Organizer';
  return (
    <Card style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={mine ? toName : fromName} uri={mine ? h.to?.avatar_url : undefined} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>
            {mine ? `Waiting for ${toName}` : `${fromName} wants you to be the Organizer`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Clock3 size={11} color={intent.info.text} />
            <Text variant="caption" style={{ color: intent.info.text }}>Sent {shortDate(h.created_at)} · expires {shortDate(h.expires_at)}</Text>
          </View>
        </View>
      </View>
      <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
        <Text variant="caption" color="secondary">Reason</Text>
        <Text style={{ fontSize: 13.5, lineHeight: 19, color: semantic.textPrimary, marginTop: 2 }}>{h.reason}</Text>
      </View>
    </Card>
  );
}

export default function Handover() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { role } = useActiveGroup();
  const { member } = useAuth();
  const { refresh: refreshGroups } = useGroups();
  const isOwner = role === 'owner';

  const current = useQuery(() => getHandover(groupId!), [groupId]);
  const opts = useQuery(() => (isOwner ? getHandoverOptions(groupId!) : Promise.resolve(null)), [groupId, isOwner]);

  const [picked, setPicked] = useState<HandoverCandidate | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState<'send' | 'cancel' | 'accept' | 'decline' | null>(null);
  const [busy, setBusy] = useState(false);

  const h = current.data ?? null;
  const incoming = !!h && h.to_member_id === member?.id;

  async function run(action: () => Promise<unknown>, done: string, after?: () => Promise<void> | void) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setBusy(false);
      setConfirming(null);
      Alert.alert('Something went wrong', (e as Error).message);
      return;
    }
    setBusy(false);
    setConfirming(null);
    toast(done);
    if (after) await after();
  }

  function onConfirm() {
    if (confirming === 'send' && picked) {
      return run(() => requestHandover(groupId!, picked.member_id, reason.trim()), 'Request sent', () => {
        setPicked(null); setReason(''); current.refetch();
      });
    }
    if (!h) return;
    if (confirming === 'cancel') return run(() => cancelHandover(groupId!, h.id), 'Request cancelled', () => { current.refetch(); opts.refetch(); });
    if (confirming === 'decline') return run(() => declineHandover(groupId!, h.id), 'Request declined', () => goBack(router));
    if (confirming === 'accept') {
      return run(() => acceptHandover(groupId!, h.id), 'You are now the Organizer', async () => {
        await refreshGroups();
        router.replace({ pathname: '/(app)/[groupId]' as any, params: { groupId } });
      });
    }
  }

  const loading = current.loading || (isOwner && opts.loading);
  const eligible = (opts.data?.members ?? []).filter((m) => m.eligible);
  const blocked = (opts.data?.members ?? []).filter((m) => !m.eligible);

  const dialog = {
    send: { title: `Ask ${picked?.full_name ?? 'this member'} to be the Organizer?`, message: 'You stay the Organizer until they accept.', label: 'Send request', destructive: false },
    cancel: { title: 'Cancel this request?', message: `${h?.to?.full_name ?? 'The member'} will be told it was withdrawn.`, label: 'Cancel request', destructive: true },
    accept: { title: 'Become the Organizer?', message: 'Pending approvals move to you right away. The current Organizer becomes a regular member.', label: 'Accept', destructive: false },
    decline: { title: 'Decline this request?', message: 'The Organizer keeps the role and can ask someone else.', label: 'Decline', destructive: true },
  }[confirming ?? 'send'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <CloseHeader title={incoming ? 'Organizer request' : 'Hand over group'} onClose={() => goBack(router)} />
      {loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {incoming && h ? (
            <>
              <RequestCard h={h} mine={false} />
              <Title>What you take over</Title>
              <TaskList />
              <Text variant="caption" color="secondary" style={{ marginTop: 8 }}>
                Membership and loan requests, reversals and the year-end distribution come to you. Your own pending loan goes to the Auditor.
              </Text>
            </>
          ) : isOwner && h ? (
            <>
              <RequestCard h={h} mine />
              <Text variant="caption" color="secondary" style={{ marginTop: 10 }}>You stay the Organizer until they accept.</Text>
            </>
          ) : isOwner ? (
            <>
              <Title>Moves to the new Organizer</Title>
              <TaskList tasks={opts.data?.tasks} />

              <Title>Choose a member</Title>
              {eligible.length === 0 ? (
                <Card><Text variant="body" color="secondary">No Active, Verified member outside the officer roles is available.</Text></Card>
              ) : (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {eligible.map((m, i) => {
                    const on = picked?.member_id === m.member_id;
                    return (
                      <Pressable key={m.member_id} onPress={() => setPicked(on ? null : m)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: on ? intent.info.soft : undefined, borderBottomWidth: i < eligible.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                        <Avatar name={m.full_name ?? 'Member'} uri={m.avatar_url} size={38} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{m.full_name ?? 'Member'}</Text>
                          <Text variant="caption" color="secondary">Verified · {ROLE_LABEL[m.role]}</Text>
                        </View>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 0 : 1.5, borderColor: semantic.borderStrong, backgroundColor: on ? semantic.brandDark : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </Card>
              )}

              {blocked.length > 0 ? (
                <>
                  <Text variant="overline" color="muted" style={{ marginTop: 16, marginBottom: 8, marginLeft: 2 }}>Not eligible · {blocked.length}</Text>
                  <Card style={{ padding: 0, overflow: 'hidden', opacity: 0.7 }}>
                    {blocked.map((m, i) => (
                      <View key={m.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < blocked.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                        <Avatar name={m.full_name ?? 'Member'} uri={m.avatar_url} size={34} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, color: semantic.textPrimary }}>{m.full_name ?? 'Member'}</Text>
                          <Text variant="caption" style={{ color: intent.warning.text }}>{m.blocked}</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}

              {picked ? (
                <>
                  <Title>{picked.full_name ?? 'Member'}</Title>
                  <Card style={{ paddingVertical: 6 }}>
                    <Row label="Current role" value={ROLE_LABEL[picked.role]} />
                    <Row label="Account" value="Verified" />
                    <Row label="Heads" value={String(picked.heads)} />
                    <Row label="Member since" value={shortDate(picked.joined_at)} last />
                  </Card>
                  <Title>Reason</Title>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Why you're handing over the group"
                    placeholderTextColor={semantic.textMuted}
                    multiline
                    maxLength={300}
                    style={{ minHeight: 84, textAlignVertical: 'top', backgroundColor: semantic.surfaceAlt, borderRadius: 14, padding: 12, fontSize: 13.5, fontFamily: 'Poppins_400Regular', color: semantic.textPrimary }}
                  />
                </>
              ) : null}
            </>
          ) : (
            <Card style={{ marginTop: 6, alignItems: 'center', gap: 8 }}>
              <Crown size={24} color={semantic.textMuted} />
              <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>No hand-over request for you.</Text>
            </Card>
          )}
        </ScrollView>
      )}

      {/* Actions */}
      {!loading ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', gap: 10 }}>
          {incoming && h ? (
            <>
              <Button label="Decline" variant="ghost" onPress={() => setConfirming('decline')} style={{ flex: 1 }} />
              <Button label="Accept" onPress={() => setConfirming('accept')} style={{ flex: 1.6 }} />
            </>
          ) : isOwner && h ? (
            <Button label="Cancel request" variant="ghost" onPress={() => setConfirming('cancel')} style={{ flex: 1 }} />
          ) : isOwner && picked ? (
            <Button
              label="Send request"
              onPress={() => (reason.trim() ? setConfirming('send') : Alert.alert('Add a reason', 'Say why you’re handing over the group.'))}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}

      <ConfirmDialog
        visible={!!confirming}
        icon={Crown}
        title={dialog.title}
        message={dialog.message}
        confirmLabel={dialog.label}
        destructive={dialog.destructive}
        loading={busy}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(null)}
      />
    </SafeAreaView>
  );
}
