/**
 * features/profile/ProfileBody.tsx
 * ----------------------------------------------------------------------------
 * Shared profile content: avatar card, verification status + "Verify now"
 * prompt when unverified, settings placeholders, and Sign Out. Reused by both
 * the account-level profile screen (groups/profile.tsx, its own BottomNav)
 * and the group-scoped one ([groupId]/profile.tsx, the group's own nav bar).
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ShieldCheck, Bell, HelpCircle, Lock, ChevronRight, LogOut, UserPen, Camera } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingState } from '@/components/shared/LoadingState';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPH } from '@/lib/phone';
import { useAuth } from '@/context/AuthContext';
import { updateProfile } from '@/api/members';
import { uploadAvatar } from '@/lib/upload';

function Row({ icon: Icon, label, onPress }: { icon: any; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
      <Icon size={20} color={semantic.brandDark} />
      <Text variant="body" style={{ flex: 1 }}>{label}</Text>
      <ChevronRight size={18} color={semantic.textMuted} />
    </Pressable>
  );
}

export function ProfileBody() {
  const router = useRouter();
  const { member, signOut, refreshMember } = useAuth();
  const verified = member?.verification_status === 'verified';
  const rejected = member?.verification_status === 'rejected';
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

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
        onPress: () => {
          // Sign out clears `member` to null right away, but the redirect to
          // the landing screen only fires a moment later — without this, the
          // profile briefly re-renders with everything reset to its empty
          // fallback (name, avatar, phone) before the screen navigates away.
          setSigningOut(true);
          signOut();
        },
      },
    ]);
  }

  if (signingOut) {
    return <LoadingState label="Signing you out…" />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}>
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 20, alignItems: 'center', gap: 6 }, shadowToken.card]}>
        <Pressable onPress={pickAvatar} disabled={uploadingAvatar} style={{ marginBottom: 6 }}>
          <Avatar name={member?.full_name} uri={member?.avatar_url} size={72} />
          <View
            style={{
              position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13,
              backgroundColor: semantic.brand, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: semantic.surface,
            }}
          >
            {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={13} color="#fff" />}
          </View>
        </Pressable>
        <Text variant="h2" style={{ fontSize: 19 }}>{member?.full_name ?? 'Your account'}</Text>
        {member?.phone ? <Text variant="body" color="secondary">{formatPH(member.phone)}</Text> : null}
        <View style={{ marginTop: 8 }}>
          <StatusBadge entity="verification" value={member?.verification_status} />
        </View>
      </View>

      {!verified && (
        <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, gap: 12 }, shadowToken.card]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={22} color={rejected ? '#C25C5E' : semantic.brandDark} />
            <View style={{ flex: 1 }}>
              <Text variant="label">{rejected ? 'Verification rejected' : 'Verify your identity'}</Text>
              <Text variant="caption" color="secondary">
                {rejected
                  ? 'Your ID was not accepted. Review the reason below and resubmit.'
                  : 'Unlock creating groups, requesting loans, and officer roles.'}
              </Text>
            </View>
          </View>
          {rejected && member?.verification_rejection_reason ? (
            <View style={{ backgroundColor: '#FBEAE9', borderRadius: 12, padding: 12 }}>
              <Text variant="caption" style={{ color: '#C25C5E' }}>{member.verification_rejection_reason}</Text>
            </View>
          ) : null}
          <Button
            label={rejected ? 'Resubmit ID' : 'Verify now'}
            onPress={() => router.push('/(app)/identity' as any)}
          />
        </View>
      )}

      <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, overflow: 'hidden' }, shadowToken.card]}>
        <Row icon={UserPen} label="Edit Profile" onPress={() => router.push('/(app)/edit-profile' as any)} />
        <View style={{ height: 1, backgroundColor: semantic.border, marginLeft: 48 }} />
        <Row icon={Bell} label="Notifications" onPress={() => router.push('/(app)/notifications' as any)} />
        <View style={{ height: 1, backgroundColor: semantic.border, marginLeft: 48 }} />
        <Row icon={Lock} label="Privacy & Security" onPress={() => {}} />
        <View style={{ height: 1, backgroundColor: semantic.border, marginLeft: 48 }} />
        <Row icon={HelpCircle} label="Help & Support" onPress={() => {}} />
      </View>

      <Pressable
        onPress={confirmSignOut}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 13, borderWidth: 1.5, borderColor: semantic.border }}
      >
        <LogOut size={18} color="#C25C5E" />
        <Text variant="label" style={{ color: '#C25C5E' }}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}
