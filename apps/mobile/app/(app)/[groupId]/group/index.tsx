import { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { MessageCircle, LogOut, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useFundSummary } from '@/features/reporting/reporting.hooks';
import { useQuery, useAction } from '@/hooks/useApi';
import { listOfficers, listMemberDirectory, leaveGroup } from '@/api/groups';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };
const ROLE_DUTY: Record<string, string> = {
  owner: 'Approves members and loan requests, waives penalties, finalizes the year-end distribution',
  treasurer: 'Confirms contributions and repayments, releases approved loans',
  auditor: 'Confirms contributions and repayments like other officers, and verifies the year-end distribution before it’s finalized',
};

function shortDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function Rule({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: semantic.border }}>
      <Text variant="body" color="secondary" style={{ fontSize: 12.5 }}>{k}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{v}</Text>
    </View>
  );
}

export default function GroupOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const { group, membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const fund = useFundSummary(groupId!);
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);
  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const leave = useAction(() => leaveGroup(groupId!));
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [copied, setCopied] = useState(false);

  const members = directory.data ?? [];
  const shownMembers = showAllMembers ? members : members.slice(0, 4);

  const cash = Number(fund.data?.available_cash ?? 0);
  const onLoan = Math.max(0, Number(fund.data?.total_loan_disbursements ?? 0) - Number(fund.data?.total_loan_repayments ?? 0));
  const totalFund = cash + onLoan;
  const cashPct = totalFund > 0 ? (cash / totalFund) * 100 : 100;

  function go(route: string) {
    router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });
  }

  async function onCopyCode() {
    if (!group?.fund_code) return;
    await Clipboard.setStringAsync(group.fund_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function onLeave() {
    Alert.alert(
      'Leave this group?',
      'Your capital is settled at cycle end, not immediately. This can’t be undone from here — you’d need to rejoin with the fund code.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave group', style: 'destructive', onPress: async () => {
            const ok = await leave.run();
            if (ok !== undefined) {
              router.replace('/(app)/groups');
            } else if (leave.error) {
              Alert.alert('Can’t leave yet', leave.error.message);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title={group?.name ?? 'Group'} subtitle={cycle?.name ?? 'No active cycle'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Fund composition ---------------- */}
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, padding: 18 }, CARD_SHADOW]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>Total fund value</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: intent.success.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: intent.success.base }} />
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>{cycle?.status === 'active' ? 'Active' : cycle?.status === 'draft' ? 'Draft' : 'No cycle'}</Text>
            </View>
          </View>
          {fund.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
          ) : (
            <Text style={{ fontSize: 28, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -1, marginTop: 6 }}>{formatPeso(totalFund)}</Text>
          )}
          <Text variant="body" color="secondary" style={{ marginTop: 8, fontSize: 12.5 }}>
            {officers.data?.member_count ?? '—'} members · <Text style={{ fontWeight: '700', color: semantic.textPrimary }}>{fund.data?.total_heads ?? '—'} heads</Text> across the group
          </Text>

          <View style={{ flexDirection: 'row', height: 9, borderRadius: 5, overflow: 'hidden', marginTop: 14, marginBottom: 12 }}>
            <View style={{ width: `${cashPct}%`, backgroundColor: semantic.brand }} />
            <View style={{ width: `${100 - cashPct}%`, backgroundColor: intent.warning.base }} />
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: semantic.brand }} />
              <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>Cash on hand</Text>
              <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(cash)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: intent.warning.base }} />
              <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>Out on loan</Text>
              <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(onLoan)}</Text>
            </View>
          </View>
        </View>
          <Text variant="caption" color="muted" style={{ paddingTop: 11,lineHeight: 16, textAlign: 'justify' }}>
            Money lent to members is still part of the fund. It comes back with interest as loans are repaid.
          </Text>

        {/* ---------------- Officers ---------------- */}
        <SectionHead title="Officers" aside={`${officers.data?.officers.length ?? 0} appointed`} />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
          {officers.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 20 }} />
          ) : (officers.data?.officers.length ?? 0) === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No officers assigned yet.</Text>
          ) : (
            officers.data!.officers.map((o, i) => (
              <View key={`${o.role}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
                <Avatar name={o.full_name ?? 'Officer'} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{o.full_name ?? 'Unnamed'}</Text>
                    <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>{ROLE_LABEL[o.role] ?? o.role}</Text>
                    </View>
                    {o.verified ? (
                      <View style={{ backgroundColor: intent.success.soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: intent.success.text }}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{ROLE_DUTY[o.role] ?? ''}</Text>
                </View>
              </View>
            ))
          )}

          <View style={{ padding: 14, backgroundColor: semantic.surfaceAlt, gap: 6 }}>
            <Text variant="overline" color="muted">How your payment is handled</Text>
            {[
              'You send the money and upload proof',
              'An officer other than you confirms it',
              'Only then does it post to the ledger',
            ].map((line, i) => (
              <View key={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>{i + 1}</Text>
                </View>
                <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 16 }}>{line}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={() => go('chat/general')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderTopWidth: 1, borderColor: semantic.border }}>
            <MessageCircle size={16} color={semantic.brandDark} />
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Open group chat</Text>
          </Pressable>
        </View>

        {/* ---------------- Cycle rules ---------------- */}
        <SectionHead title="Cycle rules" aside="Set by the Owner" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16 }, CARD_SHADOW]}>
          {cycle ? (
            <>
              <Rule k={`Contribution · ${cycle.frequency}`} v={formatPeso(cycle.contribution_amount) + ' per head'} />
              {cycle.contribution_due_day ? <Rule k="Due day" v={`${cycle.contribution_due_day}${cycle.contribution_due_day === 1 ? 'st' : cycle.contribution_due_day === 2 ? 'nd' : cycle.contribution_due_day === 3 ? 'rd' : 'th'} of each period`} /> : null}
              {cycle.penalty_amount ? (
                <Rule k="Late penalty" v={cycle.penalty_type === 'percent' ? `${cycle.penalty_amount}%` : `${formatPeso(cycle.penalty_amount)} per head`} />
              ) : null}
              <View style={{ paddingTop: 8 }}>
                <Rule k="Cycle ends" v={shortDate(cycle.end_date) === '—' ? 'Ongoing' : shortDate(cycle.end_date)} />
              </View>
            </>
          ) : (
            <Text variant="body" color="muted">No active cycle right now.</Text>
          )}
        </View>

        {/* ---------------- Members ---------------- */}
        <SectionHead title="Members" aside={`${officers.data?.member_count ?? members.length} members · ${fund.data?.total_heads ?? '—'} heads`} />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
          {directory.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 20 }} />
          ) : members.length === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No members yet.</Text>
          ) : (
            <>
              {shownMembers.map((m, i) => (
                <View key={`${m.member_id}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
                  <Avatar name={m.full_name ?? 'Member'} size={34} />
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>
                    {m.full_name ?? 'Unnamed'}{m.member_id === member?.id ? <Text style={{ color: semantic.brandDark }}> · you</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: semantic.textSecondary }}>{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                </View>
              ))}
              {members.length > 4 ? (
                <Pressable onPress={() => setShowAllMembers((s) => !s)} style={{ paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>
                    {showAllMembers ? 'Show fewer' : `See all ${members.length} members`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        {/* ---------------- Invite someone ---------------- */}
        <SectionHead title="Invite someone" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, CARD_SHADOW]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: 1 }}>{group?.fund_code ?? '—'}</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>The Owner approves every join request</Text>
          </View>
          <Pressable onPress={onCopyCode} style={{ backgroundColor: copied ? intent.success.soft : semantic.surfaceAlt, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10 }}>
            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: copied ? intent.success.text : semantic.brandDark }}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>

        {/* ---------------- My membership ---------------- */}
        <SectionHead title="My membership" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 15 }}>👤</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>My heads</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{membership?.heads ?? 1} head{(membership?.heads ?? 1) === 1 ? '' : 's'} · joined {shortDate(membership?.joined_at ?? null)}</Text>
            </View>
          </View>

          <Pressable
            onPress={onLeave}
            disabled={leave.loading || membership?.role === 'owner'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, opacity: membership?.role === 'owner' ? 0.5 : 1 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: intent.danger.soft, alignItems: 'center', justifyContent: 'center' }}>
              {leave.loading ? <ActivityIndicator size="small" color={intent.danger.text} /> : <LogOut size={17} color={intent.danger.text} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: intent.danger.text }}>Leave this group</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                {membership?.role === 'owner' ? 'Transfer ownership first — the Owner can’t leave' : 'Your capital is settled at cycle end'}
              </Text>
            </View>
            {membership?.role !== 'owner' ? <ChevronRight size={16} color={semantic.textMuted} /> : null}
          </Pressable>
        </View>

        <Text variant="caption" color="secondary" style={{ marginTop: 16, lineHeight: 17, paddingHorizontal: 2 }}>
          Every member can see the fund total and each member's heads. Individual payment records stay private to that member and the officers.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
