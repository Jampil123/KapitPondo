import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Modal, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Check, AlertTriangle, X, UserMinus } from 'lucide-react-native';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BandHeader } from '@/components/shared/DashboardBand';
import { FilterChips } from '@/components/shared/FilterChips';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useQuery } from '@/hooks/useApi';
import { listMembers, listPendingMembers, setMemberRole, revokeOfficer, type GroupMember } from '@/api/groups';
import type { GroupRole } from '@/constants/roles';

const CARD_SHADOW = {
  shadowColor: '#2A3E4B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 3,
  boxShadow: '0px 5px 16px rgba(42,62,75,0.06)',
} as const;

type Tab = 'all' | 'officers' | 'members';
type AppointRole = 'treasurer' | 'auditor';
type SheetRole = AppointRole | 'owner';

const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

const DUTY: Record<SheetRole, string[]> = {
  owner: [
    'Approves members and appoints officers',
    'Decides loans and runs the cycle',
    'You become a regular member once you hand it over',
  ],
  treasurer: [
    'Confirms contributions and loan repayments',
    'Releases approved loans to members',
    'Records walk-in payments received in person',
  ],
  auditor: [
    'Confirms contributions and repayments, like other officers',
    'Verifies reversal requests before they’re finalized',
    'Verifies the year-end distribution before the Organizer finalizes it',
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
      <Avatar name={name(m)} uri={m?.members?.avatar_url} size={size} />
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

function Pill({ tone, children }: { tone: 'role' | 'heads' | 'warn' | 'pend'; children: string }) {
  const map = {
    role: { bg: semantic.dashCard, fg: '#fff' },
    heads: { bg: '#F2F7F9', fg: semantic.textSecondary },
    warn: { bg: intent.warning.soft, fg: intent.warning.text },
    pend: { bg: intent.info.soft, fg: intent.info.text },
  } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 1.5, borderRadius: 20 }}>
      <Text style={{ fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: t.fg }}>{children}</Text>
    </View>
  );
}

export default function MembersOfficers() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [tab, setTab] = useState<Tab>('all');
  const [sheetRole, setSheetRole] = useState<SheetRole | null>(null);
  const [revoking, setRevoking] = useState<GroupMember | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const router = useRouter();

  const members = useQuery(() => listMembers(groupId!), [groupId]);
  const pending = useQuery(() => listPendingMembers(groupId!), [groupId]);

  const roster = members.data ?? [];
  const pendingRows = (pending.data ?? []) as { member_id: string; members: { full_name: string | null; avatar_url?: string | null; verification_status: string } | null }[];

  const owner = roster.find((m) => m.role === 'owner') ?? null;
  const treasurer = roster.find((m) => m.role === 'treasurer') ?? null;
  const auditor = roster.find((m) => m.role === 'auditor') ?? null;
  const totalHeads = roster.reduce((s, m) => s + m.heads, 0);
  const sheetHolder = sheetRole === 'treasurer' ? treasurer : sheetRole === 'auditor' ? auditor : null;
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

  async function onRevoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      await revokeOfficer(groupId!, revoking.member_id);
    } catch (e) {
      setRevokeBusy(false);
      setRevoking(null);
      Alert.alert('Could not revoke', (e as Error).message);
      return;
    }
    setRevokeBusy(false);
    toast(`${name(revoking)} is now a regular member`);
    setRevoking(null);
    members.refetch();
  }

  async function onAppoint(memberId: string, role: GroupRole) {
    setSheetRole(null);
    try {
      await setMemberRole(groupId!, memberId, role);
      members.refetch();
    } catch (e) {
      Alert.alert('Could not appoint', (e as Error).message);
    }
  }

  // An officer opens their seat (to revoke); a member can only fill an empty seat.
  function onPressPerson(m: GroupMember) {
    if (m.role === 'owner') return;
    if (m.role === 'treasurer' || m.role === 'auditor') return setSheetRole(m.role);
    const open = ([['treasurer', treasurer], ['auditor', auditor]] as const).filter(([, holder]) => !holder);
    if (!open.length) return Alert.alert(name(m), 'Both officer seats are filled. Revoke one first to appoint someone else.');
    Alert.alert(name(m), 'Appoint as', [
      ...open.map(([role]) => ({ text: `Make ${ROLE_LABEL[role]}`, onPress: () => onAppoint(m.member_id, role) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  const filteredPeople = useMemo(() => {
    return roster.filter((m) => tab === 'all' ? true : tab === 'officers' ? m.role !== 'member' : m.role === 'member');
  }, [roster, tab]);

  const loading = members.loading || pending.loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Manage officers" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ---------------- Tabs ---------------- */}
        <FilterChips<Tab>
          options={[{ key: 'all', label: 'All' }, { key: 'officers', label: 'Officers' }, { key: 'members', label: 'Members' }]}
          value={tab}
          onChange={setTab}
        />

        {loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} /> : (
          <>
            {tab !== 'members' ? (
              <>
                <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>Officer slots</Text>
                <View style={[{ backgroundColor: semantic.card, borderRadius: 18, overflow: 'hidden' }, shadowToken.soft]}>
                  <Pressable onPress={() => router.push({ pathname: '/(app)/[groupId]/handover' as any, params: { groupId } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
                    <Text style={{ width: 78, fontSize: 10.5, fontFamily: 'Poppins_500Medium', color: semantic.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>Organizer</Text>
                    {owner ? (
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Avatar name={name(owner)} uri={owner?.members?.avatar_url} size={30} />
                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{name(owner)}</Text>
                      </View>
                    ) : <View style={{ flex: 1 }} />}
                    <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: semantic.brandDark }}>You</Text>
                    </View>
                    <ChevronRight size={16} color={semantic.textMuted} />
                  </Pressable>

                  {(['treasurer', 'auditor'] as AppointRole[]).map((role) => {
                    const holder = role === 'treasurer' ? treasurer : auditor;
                    if (!holder) {
                      const eligibleCount = roster.filter((m) => m.members?.verification_status === 'verified').length;
                      return (
                        <Pressable key={role} onPress={() => setSheetRole(role)} style={{ backgroundColor: intent.danger.soft, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderBottomWidth: 1, borderColor: semantic.border }}>
                          <Text style={{ width: 78, fontSize: 10.5, fontFamily: 'Poppins_500Medium', color: intent.danger.text, letterSpacing: 0.4, textTransform: 'uppercase', paddingTop: 1 }}>{ROLE_LABEL[role]}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: intent.danger.text }}>Not appointed</Text>
                            <Text variant="caption" color="secondary" style={{ marginTop: 4, lineHeight: 16 }}>
                              {role === 'auditor' ? 'Nothing can be verified until this is filled — payments will sit unposted.' : 'Nothing can be recorded until this is filled.'}
                            </Text>
                            <View style={{ marginTop: 9, backgroundColor: intent.danger.base, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}>
                              <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Appoint {ROLE_LABEL[role].toLowerCase()} · {eligibleCount} eligible</Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    }
                    return (
                      <Pressable key={role} onPress={() => setSheetRole(role)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
                        <Text style={{ width: 78, fontSize: 10.5, fontFamily: 'Poppins_500Medium', color: semantic.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{ROLE_LABEL[role]}</Text>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                          <Avatar name={name(holder)} uri={holder?.members?.avatar_url} size={30} />
                          <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary, flexShrink: 1 }} numberOfLines={1}>{name(holder)}</Text>
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
                      <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: control.pass ? intent.success.text : intent.warning.text }}>{control.t1}</Text>
                      <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{control.t2}</Text>
                    </View>
                  </View>
                </View>
              </>
            ) : null}

            <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>People</Text>
            <View>
              {filteredPeople.length === 0 ? (
                <Text variant="body" color="muted" style={{ paddingVertical: 8, paddingHorizontal: 2 }}>No one matches this filter.</Text>
              ) : (
                filteredPeople.map((m, i) => {
                  const locked = m.role === 'owner';
                  return (
                    <Pressable
                      key={m.member_id}
                      disabled={locked}
                      onPress={() => onPressPerson(m)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: i < filteredPeople.length - 1 ? 1 : 0, borderColor: semantic.border }}
                    >
                      <AvatarBadge m={m} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{name(m)}</Text>
                        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {m.role !== 'member' ? <Pill tone="role">{ROLE_LABEL[m.role]}</Pill> : null}
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
                <Text style={{ fontSize: 17, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>
                  {sheetRole === 'owner' ? 'Hand over Organizer role'
                    : sheetHolder ? ROLE_LABEL[sheetRole as GroupRole]
                    : `Appoint ${sheetRole === 'auditor' ? 'an Auditor' : 'a Treasurer'}`}
                </Text>
              </View>
              <Pressable onPress={() => setSheetRole(null)} hitSlop={8}><X size={20} color={semantic.textSecondary} /></Pressable>
            </View>

            {sheetRole ? (
              <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 15, gap: 6 }, CARD_SHADOW]}>
                  <Text variant="overline" color="muted" style={{ marginBottom: 3 }}>What {sheetRole === 'owner' ? 'the Organizer' : sheetRole === 'auditor' ? 'an Auditor' : 'a Treasurer'} does</Text>
                  {DUTY[sheetRole].map((d) => (
                    <Text key={d} variant="caption" color="secondary" style={{ lineHeight: 17 }}>· {d}</Text>
                  ))}
                </View>

                {sheetHolder ? (
                  <>
                    <Text variant="overline" color="muted" style={{ marginTop: 18, marginBottom: 9, marginLeft: 2 }}>Current {ROLE_LABEL[sheetRole as GroupRole]}</Text>
                    <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, CARD_SHADOW]}>
                      <AvatarBadge m={sheetHolder} size={42} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{name(sheetHolder)}</Text>
                        <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>Verified · {sheetHolder.heads} head{sheetHolder.heads === 1 ? '' : 's'}</Text>
                      </View>
                    </View>
                    <Pressable onPress={() => setRevoking(sheetHolder)}
                      style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: intent.danger.soft, backgroundColor: semantic.surface }}>
                      <UserMinus size={15} color={intent.danger.text} />
                      <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_600SemiBold', color: intent.danger.text }}>Revoke {ROLE_LABEL[sheetRole as GroupRole].toLowerCase()} role</Text>
                    </Pressable>
                    <Text variant="caption" color="secondary" style={{ marginTop: 8, textAlign: 'center' }}>Revoke first to appoint someone else.</Text>
                  </>
                ) : (() => {
                  // One person can't hold two officer roles — current officers aren't eligible.
                  const eligible = roster.filter((m) => m.role === 'member' && m.members?.verification_status === 'verified');
                  const officersBusy = roster.filter((m) => m.role !== 'member');
                  const ineligibleActive = roster.filter((m) => m.role === 'member' && m.members?.verification_status !== 'verified');
                  return (
                    <>
                      <Text variant="overline" color="muted" style={{ marginTop: 18, marginBottom: 9, marginLeft: 2 }}>Eligible · {eligible.length}</Text>
                      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden' }, CARD_SHADOW]}>
                        {eligible.length === 0 ? (
                          <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>No eligible members.</Text>
                        ) : eligible.map((m, i) => {
                          return (
                            <View key={m.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < eligible.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                              <AvatarBadge m={m} size={38} />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }} numberOfLines={1}>{name(m)}</Text>
                                <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 15 }}>Verified · {m.heads} head{m.heads === 1 ? '' : 's'}</Text>
                              </View>
                              <Pressable
                                onPress={() => onAppoint(m.member_id, sheetRole as GroupRole)}
                                style={{ backgroundColor: semantic.dashCard, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10 }}
                              >
                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Appoint</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>

                      {officersBusy.length > 0 || ineligibleActive.length > 0 || pendingRows.length > 0 ? (
                        <>
                          <Text variant="overline" color="muted" style={{ marginTop: 18, marginBottom: 9, marginLeft: 2 }}>Not eligible · {officersBusy.length + ineligibleActive.length + pendingRows.length}</Text>
                          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, overflow: 'hidden', opacity: 0.7 }, CARD_SHADOW]}>
                            {officersBusy.map((m) => (
                              <View key={m.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}>
                                <AvatarBadge m={m} size={38} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{name(m)}</Text>
                                  <Text variant="caption" style={{ marginTop: 3, color: intent.warning.text }}>
                                    {m.role === 'owner' ? 'The Organizer' : `Already the ${ROLE_LABEL[m.role]} — revoke that role first`}
                                  </Text>
                                </View>
                              </View>
                            ))}
                            {ineligibleActive.map((m, i, arr) => (
                              <View key={m.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < arr.length - 1 || pendingRows.length > 0 ? 1 : 0, borderColor: semantic.border }}>
                                <AvatarBadge m={m} size={38} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{name(m)}</Text>
                                  <Text variant="caption" style={{ marginTop: 3, color: intent.warning.text }}>Account not verified — can't hold an officer role</Text>
                                </View>
                              </View>
                            ))}
                            {pendingRows.map((r, i) => (
                              <View key={r.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < pendingRows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                                <Avatar name={r.members?.full_name ?? 'Member'} uri={r.members?.avatar_url} size={38} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{r.members?.full_name ?? 'Unnamed'}</Text>
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
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
        {/* Inside the sheet's Modal: iOS won't present a second Modal over one that's open. */}
        <ConfirmDialog
          visible={!!revoking}
          icon={UserMinus}
          title={`Revoke ${revoking ? name(revoking) : ''}'s ${revoking ? ROLE_LABEL[revoking.role].toLowerCase() : ''} role?`}
          message="They stay in the group as a regular member and leave the officers' chat."
          confirmLabel="Revoke"
          destructive
          loading={revokeBusy}
          onConfirm={onRevoke}
          onCancel={() => setRevoking(null)}
        />
      </Modal>

    </SafeAreaView>
  );
}
