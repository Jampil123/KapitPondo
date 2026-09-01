import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Check, AlertTriangle, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { useQuery, useAction } from '@/hooks/useApi';
import { listMembers, listPendingMembers, setMemberRole, type GroupMember } from '@/api/groups';
import type { GroupRole } from '@/constants/roles';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type Tab = 'all' | 'officers' | 'members' | 'pending';
type AppointRole = 'treasurer' | 'auditor';

const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Owner', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

const DUTY: Record<AppointRole, string[]> = {
  treasurer: [
    'Confirms contributions and loan repayments',
    'Releases approved loans to members',
    'Records walk-in payments received in person',
  ],
  auditor: [
    'Confirms contributions and repayments, like other officers',
    'Verifies reversal requests before they’re finalized',
    'Verifies the year-end distribution before the Owner finalizes it',
  ],
};

function name(m: { members: { full_name: string | null } | null } | null): string {
  return m?.members?.full_name ?? 'Unnamed';
}

function AvatarBadge({ m, size = 42 }: { m: GroupMember; size?: number }) {
  const own = m.role === 'owner';
  const verified = m.members?.verification_status === 'verified';
  return (
    <View>
      <Avatar name={name(m)} size={size} />
      {own ? null : (
        <View style={{
          position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8,
          backgroundColor: verified ? intent.success.base : intent.warning.base,
          alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: semantic.surface,
        }}>
          {verified ? <Check size={8} color="#fff" strokeWidth={3.5} /> : <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: '#fff' }}>!</Text>}
        </View>
      )}
    </View>
  );
}

function Pill({ tone, children }: { tone: 'role' | 'member' | 'heads' | 'warn' | 'pend'; children: string }) {
  const map = {
    role: { bg: semantic.dashCard, fg: '#fff' },
    member: { bg: semantic.surfaceAlt, fg: semantic.brandDark },
    heads: { bg: '#F2F7F9', fg: semantic.textSecondary },
    warn: { bg: intent.warning.soft, fg: intent.warning.text },
    pend: { bg: intent.info.soft, fg: intent.info.text },
  } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.bg, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: t.fg, letterSpacing: 0.3, textTransform: 'uppercase' }}>{children}</Text>
    </View>
  );
}

export default function MembersOfficers() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [sheetRole, setSheetRole] = useState<AppointRole | null>(null);

  const members = useQuery(() => listMembers(groupId!), [groupId]);
  const pending = useQuery(() => listPendingMembers(groupId!), [groupId]);
  const changeRole = useAction((memberId: string, role: GroupRole) => setMemberRole(groupId!, memberId, role));

  const roster = members.data ?? [];
  const pendingRows = (pending.data ?? []) as { member_id: string; members: { full_name: string | null; verification_status: string } | null }[];

  const owner = roster.find((m) => m.role === 'owner') ?? null;
  const treasurer = roster.find((m) => m.role === 'treasurer') ?? null;
  const auditor = roster.find((m) => m.role === 'auditor') ?? null;
  const totalHeads = roster.reduce((s, m) => s + m.heads, 0);
  const officerCount = [owner, treasurer, auditor].filter(Boolean).length;

  // Staffing-level segregation: does one member hold 2+ of the 3 seats?
  const filledSlots = [owner, treasurer, auditor].filter((m): m is GroupMember => !!m);
  const distinctHolders = new Set(filledSlots.map((m) => m.member_id));
  const doubled = distinctHolders.size < filledSlots.length;

  const control = !auditor
    ? { pass: false, t1: 'No one can verify postings right now', t2: 'Payments recorded by the Treasurer will stay unposted until an Auditor is appointed.' }
    : doubled
    ? { pass: false, t1: 'One person records and verifies', t2: 'Someone holds two officer seats, so they can end up approving their own postings. Workable for a small group, but worth knowing.' }
    : { pass: true, t1: 'Recorder and approver are different people', t2: "Every posting is recorded by one officer and verified by another, as the group's rules require." };

  async function onAppoint(memberId: string, role: GroupRole) {
    const alreadyOfficer = role !== 'member' && filledSlots.some((m) => m.member_id === memberId && m.role !== role);
    const doAppoint = async () => {
      const ok = await changeRole.run(memberId, role);
      setSheetRole(null);
      if (ok === undefined && changeRole.error) Alert.alert('Could not appoint', changeRole.error.message);
      else { members.refetch(); }
    };
    if (alreadyOfficer) {
      Alert.alert(
        'This puts one person in two seats',
        'They would record and verify their own work. Fine for a small group running single-admin, but worth confirming.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Appoint anyway', onPress: doAppoint }],
      );
    } else {
      doAppoint();
    }
  }

  function onPressPerson(m: GroupMember) {
    if (m.role === 'owner') return;
    Alert.alert(name(m), 'Change role', [
      { text: 'Make Treasurer', onPress: () => onAppoint(m.member_id, 'treasurer') },
      { text: 'Make Auditor', onPress: () => onAppoint(m.member_id, 'auditor') },
      ...(m.role !== 'member' ? [{ text: 'Make Member', onPress: () => onAppoint(m.member_id, 'member') }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  const filteredPeople = useMemo(() => {
    if (tab === 'pending') return [];
    return roster.filter((m) => tab === 'all' ? true : tab === 'officers' ? m.role !== 'member' : m.role === 'member');
  }, [roster, tab]);

  const loading = members.loading || pending.loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Members & officers" subtitle={`${roster.length} members · ${totalHeads} heads · ${officerCount} officers`} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Tabs ---------------- */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          {([
            { key: 'all', label: 'All' },
            { key: 'officers', label: 'Officers' },
            { key: 'members', label: 'Members' },
            { key: 'pending', label: `Pending${pendingRows.length ? ` · ${pendingRows.length}` : ''}` },
          ] as { key: Tab; label: string }[]).map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: active ? semantic.dashCard : semantic.surface, borderWidth: 1, borderColor: active ? semantic.dashCard : semantic.border }}>
                <Text style={{ fontSize: 12, fontFamily: 'Poppins_700Bold', color: active ? '#fff' : semantic.textSecondary }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} /> : (
          <>
            {tab !== 'pending' && tab !== 'members' ? (
              <>
                <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>Officer slots</Text>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
                    <Text style={{ width: 78, fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: semantic.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>Owner</Text>
                    {owner ? (
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Avatar name={name(owner)} size={30} />
                        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{name(owner)}</Text>
                      </View>
                    ) : <View style={{ flex: 1 }} />}
                    <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>You</Text>
                    </View>
                  </View>

                  {(['treasurer', 'auditor'] as AppointRole[]).map((role) => {
                    const holder = role === 'treasurer' ? treasurer : auditor;
                    if (!holder) {
                      const eligibleCount = roster.filter((m) => m.members?.verification_status === 'verified').length;
                      return (
                        <Pressable key={role} onPress={() => setSheetRole(role)} style={{ backgroundColor: intent.danger.soft, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderBottomWidth: 1, borderColor: semantic.border }}>
                          <Text style={{ width: 78, fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: intent.danger.text, letterSpacing: 0.4, textTransform: 'uppercase', paddingTop: 1 }}>{ROLE_LABEL[role]}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: intent.danger.text }}>Not appointed</Text>
                            <Text variant="caption" color="secondary" style={{ marginTop: 4, lineHeight: 16 }}>
                              {role === 'auditor' ? 'Nothing can be verified until this is filled — payments will sit unposted.' : 'Nothing can be recorded until this is filled.'}
                            </Text>
                            <View style={{ marginTop: 9, backgroundColor: intent.danger.base, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}>
                              <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Appoint {ROLE_LABEL[role].toLowerCase()} · {eligibleCount} eligible</Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    }
                    return (
                      <Pressable key={role} onPress={() => setSheetRole(role)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
                        <Text style={{ width: 78, fontSize: 10.5, fontFamily: 'Poppins_700Bold', color: semantic.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{ROLE_LABEL[role]}</Text>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                          <Avatar name={name(holder)} size={30} />
                          <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{name(holder)}</Text>
                        </View>
                        <ChevronRight size={16} color={semantic.textMuted} />
                      </Pressable>
                    );
                  })}

                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, backgroundColor: semantic.surfaceAlt }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: control.pass ? intent.success.soft : intent.warning.soft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      {control.pass ? <Check size={11} color={intent.success.text} strokeWidth={3} /> : <AlertTriangle size={11} color={intent.warning.text} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_700Bold', color: control.pass ? intent.success.text : intent.warning.text }}>{control.t1}</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{control.t2}</Text>
                    </View>
                  </View>
                </View>
              </>
            ) : null}

            {/* ---------------- People / Pending ---------------- */}
            <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>{tab === 'pending' ? 'Pending join requests' : 'People'}</Text>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, CARD_SHADOW]}>
              {tab === 'pending' ? (
                pendingRows.length === 0 ? (
                  <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No pending requests.</Text>
                ) : (
                  pendingRows.map((r, i) => (
                    <Pressable
                      key={r.member_id}
                      onPress={() => router.push({ pathname: '/(app)/[groupId]/members/approvals' as any, params: { groupId } })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < pendingRows.length - 1 ? 1 : 0, borderColor: semantic.border }}
                    >
                      <Avatar name={r.members?.full_name ?? 'Member'} size={42} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{r.members?.full_name ?? 'Unnamed'}</Text>
                        <View style={{ flexDirection: 'row', gap: 5, marginTop: 6 }}>
                          <Pill tone="pend">Pending approval</Pill>
                        </View>
                      </View>
                      <ChevronRight size={16} color={semantic.textMuted} />
                    </Pressable>
                  ))
                )
              ) : filteredPeople.length === 0 ? (
                <Text variant="body" color="muted" style={{ padding: 20, textAlign: 'center' }}>No one matches this filter.</Text>
              ) : (
                filteredPeople.map((m, i) => {
                  const locked = m.role === 'owner';
                  return (
                    <Pressable
                      key={m.member_id}
                      disabled={locked}
                      onPress={() => onPressPerson(m)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < filteredPeople.length - 1 ? 1 : 0, borderColor: semantic.border }}
                    >
                      <AvatarBadge m={m} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{name(m)}</Text>
                        <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                          {m.role !== 'member' ? <Pill tone="role">{ROLE_LABEL[m.role]}</Pill> : null}
                          <Pill tone="member">Member</Pill>
                          <Pill tone="heads">{`${m.heads} head${m.heads === 1 ? '' : 's'}`}</Pill>
                          {m.members?.verification_status !== 'verified' ? <Pill tone="warn">Unverified</Pill> : null}
                        </View>
                      </View>
                      {!locked ? <ChevronRight size={16} color={semantic.textMuted} /> : null}
                    </Pressable>
                  );
                })
              )}
            </View>

            <Text variant="caption" color="secondary" style={{ marginTop: 16, lineHeight: 17, paddingHorizontal: 2 }}>
              Officers keep their membership. Being appointed Treasurer or Auditor doesn't change a person's heads or their year-end share.
            </Text>
          </>
        )}
      </ScrollView>

      {/* ---------------- Appointment sheet ---------------- */}
      <Modal visible={!!sheetRole} transparent animationType="slide" onRequestClose={() => setSheetRole(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(9,32,42,0.5)', justifyContent: 'flex-end' }} onPress={() => setSheetRole(null)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: semantic.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '80%' }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: semantic.borderStrong, alignSelf: 'center', marginTop: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 20, paddingBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>Appoint {sheetRole === 'auditor' ? 'an Auditor' : 'a Treasurer'}</Text>
                <Text variant="caption" color="secondary" style={{ marginTop: 4, lineHeight: 16 }}>Only active, verified members can hold this position.</Text>
              </View>
              <Pressable onPress={() => setSheetRole(null)} hitSlop={8}><X size={20} color={semantic.textSecondary} /></Pressable>
            </View>

            {sheetRole ? (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 15, gap: 6 }, CARD_SHADOW]}>
                  <Text variant="overline" color="muted" style={{ marginBottom: 3 }}>What {sheetRole === 'auditor' ? 'an Auditor' : 'a Treasurer'} does</Text>
                  {DUTY[sheetRole].map((d) => (
                    <Text key={d} variant="caption" color="secondary" style={{ lineHeight: 17 }}>· {d}</Text>
                  ))}
                </View>

                {(() => {
                  const currentHolder = sheetRole === 'auditor' ? auditor : treasurer;
                  const eligible = roster.filter((m) => m.member_id !== currentHolder?.member_id && m.members?.verification_status === 'verified');
                  const ineligibleActive = roster.filter((m) => m.member_id !== currentHolder?.member_id && m.members?.verification_status !== 'verified');
                  return (
                    <>
                      <Text variant="overline" color="muted" style={{ marginTop: 18, marginBottom: 9, marginLeft: 2 }}>Eligible · {eligible.length}</Text>
                      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, CARD_SHADOW]}>
                        {eligible.length === 0 ? (
                          <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>No eligible members.</Text>
                        ) : eligible.map((m, i) => {
                          const otherSeat = filledSlots.find((f) => f.member_id === m.member_id && f.role !== sheetRole);
                          return (
                            <View key={m.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < eligible.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                              <AvatarBadge m={m} size={38} />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }} numberOfLines={1}>{name(m)}</Text>
                                <Text variant="caption" color={otherSeat ? undefined : 'secondary'} style={{ marginTop: 3, lineHeight: 15, color: otherSeat ? intent.warning.text : undefined }}>
                                  {otherSeat ? `Already ${ROLE_LABEL[otherSeat.role]} · allowed but reduces separation` : `Verified · ${m.heads} head${m.heads === 1 ? '' : 's'}`}
                                </Text>
                              </View>
                              <Pressable onPress={() => onAppoint(m.member_id, sheetRole)} style={{ backgroundColor: semantic.dashCard, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10 }}>
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Appoint</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>

                      {ineligibleActive.length > 0 || pendingRows.length > 0 ? (
                        <>
                          <Text variant="overline" color="muted" style={{ marginTop: 18, marginBottom: 9, marginLeft: 2 }}>Not eligible · {ineligibleActive.length + pendingRows.length}</Text>
                          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden', opacity: 0.7 }, CARD_SHADOW]}>
                            {ineligibleActive.map((m, i, arr) => (
                              <View key={m.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < arr.length - 1 || pendingRows.length > 0 ? 1 : 0, borderColor: semantic.border }}>
                                <AvatarBadge m={m} size={38} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{name(m)}</Text>
                                  <Text variant="caption" style={{ marginTop: 3, color: intent.warning.text }}>Account not verified — can't hold an officer role</Text>
                                </View>
                              </View>
                            ))}
                            {pendingRows.map((r, i) => (
                              <View key={r.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < pendingRows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                                <Avatar name={r.members?.full_name ?? 'Member'} size={38} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{r.members?.full_name ?? 'Unnamed'}</Text>
                                  <Text variant="caption" style={{ marginTop: 3, color: intent.warning.text }}>Membership still pending your approval</Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        </>
                      ) : null}
                    </>
                  );
                })()}

                <Text variant="caption" color="secondary" style={{ marginTop: 16, lineHeight: 17 }}>
                  They'll be notified right away, and the change is written to the audit log. They can step down at any time, or you can revoke the role from their profile.
                </Text>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
