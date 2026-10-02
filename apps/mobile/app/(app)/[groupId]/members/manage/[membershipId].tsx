import { useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Check, Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { toast } from '@/components/ui/Toast';
import { AppBar } from '@/components/shared/AppBar';
import { Alert } from '@/lib/alert';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useQuery } from '@/hooks/useApi';
import {
  getMemberStanding, suspendMembership, reactivateMembership, startWithdrawal, cancelWithdrawal,
  type Withdrawal,
} from '@/api/groups';

const STATUS: Record<string, { label: string; tone: { soft: string; text: string } }> = {
  active: { label: 'Active', tone: intent.success },
  suspended: { label: 'Suspended', tone: intent.danger },
  exited: { label: 'Withdrawn', tone: intent.warning },
};

function shortDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 18, padding: 16, marginTop: 14 }, shadowToken.soft, style]}>{children}</View>;
}

function Line({ label, value, sign, bold }: { label: string; value: number; sign?: '+' | '−'; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 5 }}>
      <Text variant={bold ? 'label' : 'caption'} color={bold ? undefined : 'secondary'} style={{ flex: 1 }}>{label}</Text>
      <Text style={{
        fontSize: bold ? 17 : 13, fontFamily: 'Poppins_700Bold',
        color: bold ? semantic.textPrimary : sign === '−' && value > 0 ? intent.danger.text : semantic.textPrimary,
      }}>
        {sign && value > 0 ? `${sign} ` : ''}{formatPeso(value)}
      </Text>
    </View>
  );
}

function Step({ done, title, sub }: { done: boolean; title: string; sub?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? intent.success.soft : semantic.surfaceAlt, marginTop: 1 }}>
        {done ? <Check size={12} color={intent.success.text} strokeWidth={3} /> : <Clock size={12} color={semantic.textMuted} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: done ? semantic.textPrimary : semantic.textSecondary }}>{title}</Text>
        {sub ? <Text variant="caption" color="muted">{sub}</Text> : null}
      </View>
    </View>
  );
}

function WithdrawalSteps({ w }: { w: Withdrawal }) {
  return (
    <>
      <Step done title={`Started by ${w.initiator?.full_name ?? 'the Organizer'}`} sub={shortDate(w.initiated_at)} />
      <Step
        done={!!w.released_at}
        title={w.released_at ? `Payout released by ${w.releaser?.full_name ?? 'the Treasurer'}` : 'The Treasurer pays out the settlement'}
        sub={w.released_at ? shortDate(w.released_at) : undefined}
      />
      <Step
        done={!!w.verified_at}
        title={w.verified_at ? `Verified by ${w.verifier?.full_name ?? 'the Auditor'}` : 'The Auditor verifies and posts it'}
        sub={w.verified_at ? shortDate(w.verified_at) : 'The member leaves the group once verified'}
      />
    </>
  );
}

export default function ManageMember() {
  const { groupId, membershipId } = useLocalSearchParams<{ groupId: string; membershipId: string }>();
  const { role } = useActiveGroup();
  const isOrganizer = role === 'owner';
  const standing = useQuery(() => getMemberStanding(groupId!, membershipId!), [groupId, membershipId], [
    { table: 'memberships', filter: `id=eq.${membershipId}` },
    { table: 'withdrawals', filter: `membership_id=eq.${membershipId}` },
  ]);

  const [prompt, setPrompt] = useState<'suspend' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(call: () => Promise<unknown>, done: string, failTitle: string) {
    setBusy(true);
    try {
      await call();
      toast(done);
      standing.refetch();
    } catch (e) {
      Alert.alert(failTitle, (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const data = standing.data;
  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Manage member" />
        {standing.error
          ? <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40, paddingHorizontal: 24 }}>{standing.error.message}</Text>
          : <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} />}
      </SafeAreaView>
    );
  }

  const { membership: m, settlement: s, withdrawal: w } = data;
  const name = m.members?.full_name ?? 'Member';
  const open = w && (w.status === 'pending_release' || w.status === 'released') ? w : null;
  const done = w?.status === 'verified' ? w : null;
  // An open or finished withdrawal shows its frozen numbers; otherwise today's.
  const shown = open ?? done ?? s;
  const status = STATUS[m.status] ?? STATUS.active;

  function onWithdraw() {
    Alert.alert(
      `Withdraw ${name}?`,
      `They'll be paid ${formatPeso(s.payout)} and leave the group once the Treasurer pays out and the Auditor verifies. They can't contribute or borrow in the meantime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => act(() => startWithdrawal(groupId!, membershipId!), 'Withdrawal started — the Treasurer pays out next', 'Could not withdraw') },
      ],
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <AppBar title="Manage member" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Who */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <Avatar name={name} uri={m.members?.avatar_url} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="h3" style={{ fontSize: 17 }} numberOfLines={1}>{name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <View style={{ backgroundColor: status.tone.soft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: status.tone.text }}>{status.label}</Text>
              </View>
              <Text variant="caption" color="secondary">{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
            </View>
          </View>
        </View>
        {m.status_reason && m.status !== 'active' ? (
          <Text variant="caption" color="secondary" style={{ marginTop: 10 }}>
            {m.status_reason}{m.status_changed_at ? ` · ${shortDate(m.status_changed_at)}` : ''}
          </Text>
        ) : null}

        {/* Settlement */}
        <Card>
          <Text variant="overline" color="muted" style={{ marginBottom: 6 }}>
            {open || done ? 'Withdrawal settlement' : 'If they withdraw now'}
          </Text>
          <Line label="Contributions since the last year-end share" value={Number(shown.capital)} />
          <Line label="Loan still owed" value={Number(shown.loan_owed)} sign="−" />
          <Line label="Unpaid penalties" value={Number(shown.penalties)} sign="−" />
          <View style={{ borderTopWidth: 1, borderColor: semantic.border, marginTop: 6, paddingTop: 6 }}>
            <Line label={done ? 'Paid out' : 'Payout'} value={Math.max(Number(shown.payout), 0)} bold />
          </View>
          <Text variant="caption" color="muted" style={{ marginTop: 8, lineHeight: 15 }}>
            The loan and penalties are paid off from their contributions. Interest earnings stay in the fund and are shared at year-end.
          </Text>
        </Card>

        {/* Withdrawal progress */}
        {open || done ? (
          <Card>
            <Text variant="overline" color="muted" style={{ marginBottom: 4 }}>Withdrawal</Text>
            <WithdrawalSteps w={(open ?? done)!} />
          </Card>
        ) : null}

        {/* What stops a withdrawal */}
        {!open && !done && s.blockers.length > 0 && m.status !== 'exited' ? (
          <View style={{ marginTop: 14, backgroundColor: intent.warning.soft, borderRadius: 16, padding: 14, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={15} color={intent.warning.text} />
              <Text variant="label" style={{ fontSize: 12.5, color: intent.warning.text }}>Can't withdraw yet</Text>
            </View>
            {s.blockers.map((b) => <Text key={b} variant="caption" style={{ color: intent.warning.text, lineHeight: 16 }}>• {b}</Text>)}
          </View>
        ) : null}

        {/* Organizer actions */}
        {isOrganizer && m.status !== 'exited' ? (
          <View style={{ marginTop: 20, gap: 10 }}>
            {open ? (
              open.status === 'pending_release'
                ? <Button label="Cancel withdrawal" variant="ghost" onPress={() => setPrompt('cancel')} disabled={busy} />
                : <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>The payout was released, so this can no longer be cancelled.</Text>
            ) : (
              <>
                {m.status === 'active' ? (
                  <Button label="Suspend" variant="ghost" onPress={() => setPrompt('suspend')} disabled={busy || m.role !== 'member'} />
                ) : (
                  <Button
                    label="Reactivate"
                    onPress={() => act(() => reactivateMembership(groupId!, membershipId!), 'Membership reactivated', 'Could not reactivate')}
                    disabled={busy}
                  />
                )}
                <Button label="Withdraw" onPress={onWithdraw} disabled={busy || s.blockers.length > 0} style={{ backgroundColor: intent.danger.base }} />
                {m.role !== 'member' ? (
                  <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>Officers can't be suspended or withdrawn. Change their role to Member first.</Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      <ReasonPrompt
        visible={prompt === 'suspend'}
        title={`Suspend ${name}?`}
        placeholder="Why? (shown to the member)"
        confirmLabel="Suspend"
        destructive
        required
        onCancel={() => setPrompt(null)}
        onConfirm={(reason) => { setPrompt(null); act(() => suspendMembership(groupId!, membershipId!, reason), 'Member suspended', 'Could not suspend'); }}
      />
      <ReasonPrompt
        visible={prompt === 'cancel'}
        title="Cancel this withdrawal?"
        placeholder="Why? (shown to the member)"
        confirmLabel="Cancel withdrawal"
        destructive
        required
        onCancel={() => setPrompt(null)}
        onConfirm={(reason) => { setPrompt(null); if (open) act(() => cancelWithdrawal(groupId!, open.id, reason), 'Withdrawal cancelled', 'Could not cancel'); }}
      />
    </SafeAreaView>
  );
}
