import { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { MessageCircle, LogOut, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useAuth } from '@/context/AuthContext';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useQuery, useAction } from '@/hooks/useApi';
import { listOfficers, listMemberDirectory, leaveGroup } from '@/api/groups';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

const ROLE_LABEL: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };
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

function SectionHead({ title, aside, first }: { title: string; aside?: string; first?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: first ? 4 : 20, marginBottom: 9 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

function Rule({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderColor: semantic.border }}>
      <Text variant="body" color="secondary" style={{ fontSize: 12.5 }}>{k}</Text>
      <Text style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{v}</Text>
    </View>
  );
}

export default function GroupOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { member } = useAuth();
  const { group, membership } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const officers = useQuery(() => listOfficers(groupId!), [groupId]);
  const directory = useQuery(() => listMemberDirectory(groupId!), [groupId]);
  const leave = useAction(() => leaveGroup(groupId!));
  const [copied, setCopied] = useState(false);

  const members = directory.data ?? [];
  const shownMembers = members.slice(0, 4);

  const totalHeads = members.reduce((sum, m) => sum + m.heads, 0);
  const ready = !directory.loading || members.length > 0;

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
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Group & Officers" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Officers ---------------- */}
        <SectionHead first title="Officers" aside={`${officers.data?.officers.length ?? 0} appointed`} />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
          {officers.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 20 }} />
          ) : (officers.data?.officers.length ?? 0) === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No officers assigned yet.</Text>
          ) : (
            officers.data!.officers.map((o, i) => (
              <View key={`${o.role}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
                <Avatar name={o.full_name ?? 'Officer'} uri={o.avatar_url} size={42} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{o.full_name ?? 'Unnamed'}</Text>
                    <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>{ROLE_LABEL[o.role] ?? o.role}</Text>
                    </View>
                    {o.verified ? (
                      <View style={{ backgroundColor: intent.success.soft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 }}>
                        <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_600SemiBold', color: intent.success.text }}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{ROLE_DUTY[o.role] ?? ''}</Text>
                </View>
              </View>
            ))
          )}

          <Pressable onPress={() => go('chat/general')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderTopWidth: 1, borderColor: semantic.border }}>
            <MessageCircle size={16} color={semantic.brandDark} />
            <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>Open group chat</Text>
          </Pressable>
        </View>

        {/* ---------------- Members + heads summary ---------------- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, marginTop: 14 }}>
          <View style={{ flex: 1 }}>
            <Text variant="overline" color="muted">Members</Text>
            <Text style={{ fontSize: 30, lineHeight: 38, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>{ready ? members.length : '—'}</Text>
          </View>
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: semantic.border, marginHorizontal: 18 }} />
          <View style={{ flex: 1 }}>
            <Text variant="overline" color="muted">Heads</Text>
            <Text style={{ fontSize: 30, lineHeight: 38, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>{ready ? totalHeads : '—'}</Text>
          </View>
        </View>

        {/* ---------------- Members ---------------- */}
        <SectionHead title="Members" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
          {directory.loading ? (
            <ActivityIndicator color={semantic.brand} style={{ margin: 20 }} />
          ) : members.length === 0 ? (
            <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No members yet.</Text>
          ) : (
            <>
              {shownMembers.map((m, i) => (
                <View key={`${m.member_id}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: semantic.border }}>
                  <Avatar name={m.full_name ?? 'Member'} uri={m.avatar_url} size={34} />
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>
                    {m.full_name ?? 'Unnamed'}{m.member_id === member?.id ? <Text style={{ color: semantic.brandDark }}> · you</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                </View>
              ))}
              {members.length > 4 ? (
                <Pressable onPress={() => go('members')} style={{ paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>
                    See all {members.length} members
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        {/* ---------------- Cycle rules ---------------- */}
        <SectionHead title="Cycle rules" aside="Set by the Organizer" />
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

        {/* ---------------- Invite someone ---------------- */}
        <SectionHead title="Invite someone" />
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, CARD_SHADOW]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: 1 }}>{group?.fund_code ?? '—'}</Text>
            <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>The Organizer approves every join request</Text>
          </View>
          <Pressable onPress={onCopyCode} style={{ backgroundColor: copied ? intent.success.soft : semantic.surfaceAlt, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10 }}>
            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: copied ? intent.success.text : semantic.brandDark }}>{copied ? 'Copied' : 'Copy'}</Text>
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
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>My heads</Text>
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
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: intent.danger.text }}>Leave this group</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                {membership?.role === 'owner' ? 'Hand over the Organizer role first — you can’t leave' : 'Your capital is settled at cycle end'}
              </Text>
            </View>
            {membership?.role !== 'owner' ? <ChevronRight size={16} color={semantic.textMuted} /> : null}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
