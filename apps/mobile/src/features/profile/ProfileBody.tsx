/**
 * features/profile/ProfileBody.tsx
 * ----------------------------------------------------------------------------
 * Shared profile content, restructured per the kapitpondo-profile reference:
 * a gradient identity band, a verification-state card that leads (it's the
 * one thing that gates loans/group-creation/officer roles per §1.3), real
 * per-group role pills, an Account section, and Support/Sign-out. Reused by
 * both the account-level profile screen (groups/profile.tsx, its own
 * BottomNav) and the group-scoped one ([groupId]/profile.tsx, the group's
 * own nav bar) — each host screen supplies its own back/header chrome, so
 * this component doesn't duplicate a back button inside the band.
 *
 * What's real vs. honestly stubbed:
 *   avatar/name/phone/verification → useAuth().member          ✅ real
 *   verification 4-state card       → member.verification_status ✅ real (unverified/pending/verified/rejected)
 *   "My groups" + role pills        → useGroups()                ✅ real (one real role per membership — no group shows two role pills, unlike the mockup's example, since a membership has exactly one role field)
 *   email "Not set" pill            → member.email                ✅ real
 *   app version                     → expo-constants              ✅ real (not a hardcoded string)
 *   Notifications                   → kept as ONE row to the real Notification Center — the reference's 3 toggles would need a per-category preferences API that doesn't exist; a fake toggle that silently does nothing is worse than not having one
 *   Login activity / consent date / Download my records / Change password / Help / Feedback
 *                                    → no backing API found for any of these; kept as real, tappable rows using this codebase's own "Coming soon" convention (see soon() below) rather than inventing device counts, consent timestamps, or a fake screen
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell, HelpCircle, Lock, ChevronRight, LogOut, UserPen,
  Check, Clock, AlertTriangle, Users, Plus, Mail, Smartphone, KeyRound,
  Download, History, MessageCircle, Info,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { semantic, shadowToken, intent, type IntentName } from '@/theme/colors';
import { getStatusMeta } from '@/theme/status';
import { formatPH } from '@/lib/phone';
import { useAuth } from '@/context/AuthContext';
import { useGroups } from '@/context/GroupContext';
import { updateProfile } from '@/api/members';
import { uploadAvatar } from '@/lib/upload';

function soon(label: string) { Alert.alert(label, 'Coming soon.'); }

function Row({ icon: Icon, label, sub, pill, onPress }: { icon: any; label: string; sub?: string; pill?: { text: string; tone: IntentName }; onPress?: () => void }) {
  const tone = pill ? intent[pill.tone] : null;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={semantic.brandDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ fontSize: 13.5 }}>{label}</Text>
        {sub ? <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {tone ? (
        <View style={{ backgroundColor: tone.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: tone.text }}>{pill!.text}</Text>
        </View>
      ) : (
        <ChevronRight size={18} color={semantic.textMuted} />
      )}
    </Pressable>
  );
}

const VERIFY_META: Record<string, { icon: any; tone: IntentName; title: string; subtitle: (reason: string | null) => string; unlocks: boolean; btn: string }> = {
  verified: { icon: Check, tone: 'success', title: 'Account verified', subtitle: () => 'Full access to loans, group creation and officer roles', unlocks: false, btn: '' },
  pending: { icon: Clock, tone: 'info', title: 'ID under review', subtitle: () => 'Usually reviewed within 2 working days', unlocks: true, btn: 'View what I submitted' },
  unverified: { icon: AlertTriangle, tone: 'warning', title: 'Basic account', subtitle: () => 'You can join groups and contribute. Verify to unlock the rest.', unlocks: true, btn: 'Verify my account' },
  rejected: { icon: AlertTriangle, tone: 'danger', title: 'ID could not be verified', subtitle: (r) => r ?? 'Your ID was not accepted. You can submit a new one.', unlocks: true, btn: 'Submit a new ID' },
};

export function ProfileBody() {
  const router = useRouter();
  const { member, signOut, refreshMember } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const status = member?.verification_status ?? 'unverified';
  const vmeta = VERIFY_META[status] ?? VERIFY_META.unverified;
  const vtone = intent[vmeta.tone];

  async function pickAvatar() {
    if (!member) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled) return;
    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadAvatar(member.id, res.assets[0].uri);
      await updateProfile({ avatar_url: avatarUrl });
      await refreshMember();
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        // AuthContext's signingOut flag drives a full-screen loader in
        // RootNavigator (app/_layout.tsx) for the whole redirect — this
        // screen may keep rendering with `member` already cleared to null
        // for a moment, but that's covered by the overlay, not visible.
        onPress: () => signOut(),
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#4C7C90', semantic.brandDark, '#35606F']} style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 26 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable onPress={pickAvatar} disabled={uploadingAvatar}>
            <Avatar name={member?.full_name} uri={member?.avatar_url} size={64} />
            <View
              style={{
                position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12,
                backgroundColor: uploadingAvatar ? semantic.brand : vtone.strong, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: semantic.brandDark,
              }}
            >
              {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <vmeta.icon size={12} color="#fff" strokeWidth={2.6} />}
            </View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 19, fontFamily: 'Poppins_700Bold', color: '#fff' }} numberOfLines={1}>{member?.full_name ?? 'Your account'}</Text>
            <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', marginTop: 3 }} numberOfLines={1}>
              {member?.phone ? formatPH(member.phone) : 'No phone on file'}
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/edit-profile' as any)}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20 }}
            >
              <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: '#fff' }}>Edit profile</Text>
              <ChevronRight size={12} color="#fff" />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <View style={{ backgroundColor: semantic.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -18, padding: 18, gap: 20 }}>

        {/* Verification state — leads because it gates what the account can do */}
        <View style={[{ backgroundColor: vtone.soft, borderRadius: 18, padding: 16 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: vtone.strong, alignItems: 'center', justifyContent: 'center' }}>
              <vmeta.icon size={16} color="#fff" strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_700Bold', color: vtone.text }}>{vmeta.title}</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{vmeta.subtitle(member?.verification_rejection_reason ?? null)}</Text>
            </View>
          </View>

          {vmeta.unlocks ? (
            <View style={{ marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(30,58,71,0.09)', gap: 7 }}>
              {['Request a loan', 'Create your own group', 'Be appointed Treasurer or Auditor'].map((u) => (
                <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Lock size={13} color={intent.warning.text} />
                  <Text variant="caption" color="secondary">{u}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {vmeta.btn ? (
            <Button
              label={vmeta.btn}
              onPress={() => router.push('/(app)/identity' as any)}
              style={{ marginTop: 13 }}
            />
          ) : null}
        </View>

        {/* My groups — roles live per membership, not on the person */}
        <View>
          <Text variant="overline" color="muted" style={{ marginBottom: 9, marginLeft: 4 }}>My groups</Text>
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
            {groupsLoading ? (
              <ActivityIndicator color={semantic.brand} style={{ margin: 16 }} />
            ) : groups.length === 0 ? (
              <Text variant="body" color="muted" style={{ textAlign: 'center', padding: 20 }}>You haven't joined a group yet.</Text>
            ) : (
              groups.map((m) => {
                const roleMeta = getStatusMeta('role', m.role);
                const tone = intent[roleMeta.intent];
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => router.push({ pathname: '/(app)/[groupId]' as any, params: { groupId: m.groups.id } })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderBottomWidth: 1, borderColor: semantic.border }}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={16} color={semantic.brandDark} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" style={{ fontSize: 13.5 }} numberOfLines={1}>{m.groups.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 5, marginTop: 5 }}>
                        <View style={{ backgroundColor: tone.soft, paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 20 }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: tone.text }}>{roleMeta.label}</Text>
                        </View>
                        {m.status === 'pending' ? (
                          <View style={{ backgroundColor: intent.warning.soft, paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: intent.warning.text }}>Pending approval</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <ChevronRight size={18} color={semantic.textMuted} />
                  </Pressable>
                );
              })
            )}
            <Row icon={Plus} label="Join a group by code" onPress={() => router.push('/(app)/groups/join' as any)} />
          </View>
        </View>

        {/* Account */}
        <View>
          <Text variant="overline" color="muted" style={{ marginBottom: 9, marginLeft: 4 }}>Account</Text>
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
            <Row icon={UserPen} label="Personal information" sub="Name, birthday, address" onPress={() => router.push('/(app)/edit-profile' as any)} />
            <Row icon={Smartphone} label="Mobile number" sub={member?.phone ? formatPH(member.phone) : undefined} pill={{ text: 'Confirmed', tone: 'success' }} />
            <Row
              icon={Mail}
              label="Email address"
              sub={member?.email ?? 'Add one to recover your account by email'}
              pill={member?.email ? undefined : { text: 'Not set', tone: 'warning' }}
              onPress={() => router.push('/(app)/edit-profile' as any)}
            />
            <Row icon={KeyRound} label="Change password" onPress={() => soon('Change password')} />
          </View>
        </View>

        {/* Notifications — one real row to the Notification Center, not fabricated per-category toggles */}
        <View>
          <Text variant="overline" color="muted" style={{ marginBottom: 9, marginLeft: 4 }}>Notifications</Text>
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
            <Row icon={Bell} label="Notification Center" sub="Payments, postings and group announcements" onPress={() => router.push('/(app)/notifications' as any)} />
          </View>
        </View>

        {/* Privacy & security */}
        <View>
          <Text variant="overline" color="muted" style={{ marginBottom: 9, marginLeft: 4 }}>Privacy &amp; security</Text>
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
            <Row icon={History} label="Login activity" onPress={() => soon('Login activity')} />
            <Row icon={Lock} label="My data & consent" sub="Review what we collect and why" onPress={() => soon('My data & consent')} />
            <Row icon={Download} label="Download my records" sub="Contributions, loans and payouts" onPress={() => soon('Download my records')} />
          </View>
        </View>

        {/* Support */}
        <View>
          <Text variant="overline" color="muted" style={{ marginBottom: 9, marginLeft: 4 }}>Support</Text>
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
            <Row icon={HelpCircle} label="Help centre" onPress={() => soon('Help centre')} />
            <Row icon={MessageCircle} label="Send feedback" onPress={() => soon('Send feedback')} />
            <Row icon={Info} label="About KapitPondo" sub={`Version ${Constants.expoConfig?.version ?? '—'}`} onPress={() => soon('About KapitPondo')} />
          </View>
        </View>

        <Pressable
          onPress={confirmSignOut}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 13, borderWidth: 1.5, borderColor: semantic.border }}
        >
          <LogOut size={18} color={intent.danger.text} />
          <Text variant="label" style={{ color: intent.danger.text }}>Sign Out</Text>
        </Pressable>

        <Text variant="caption" color="muted" style={{ textAlign: 'center', lineHeight: 17 }}>
          KapitPondo records money that moves outside the app.{'\n'}It never holds or transfers your funds.
        </Text>
      </View>
    </ScrollView>
  );
}
