import { useState } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent } from '@/theme/colors';
import { updateNotificationPreferences } from '@/api/notificationPreferences';
import type { NotificationPreferences } from '@/api/members';
import { useAuth } from '@/context/AuthContext';

const BAND_TOP = '#4C7C90';

const CATEGORIES: { key: keyof NotificationPreferences; label: string; sub: string }[] = [
  { key: 'payments', label: 'Payments', sub: 'Contributions, GCash proofs, and reminders' },
  { key: 'loans', label: 'Loans', sub: 'Approvals, disbursements, and repayments' },
  { key: 'group_announcements', label: 'Group Announcements', sub: 'Membership, roles, and distributions' },
  { key: 'direct_messages', label: 'Direct Messages', sub: 'New messages from group members' },
  { key: 'account_security', label: 'Account & Security', sub: 'Identity verification and account changes' },
];

const DEFAULTS: NotificationPreferences = {
  payments: true,
  loans: true,
  group_announcements: true,
  direct_messages: true,
  account_security: true,
};

export default function NotificationCenter() {
  const { member, refreshMember } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>({ ...DEFAULTS, ...member?.notification_preferences });
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  async function onToggle(key: keyof NotificationPreferences, value: boolean) {
    const previous = prefs;
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving(key);
    setError(undefined);
    try {
      const updated = await updateNotificationPreferences({ [key]: value });
      setPrefs((p) => ({ ...p, ...updated }));
      refreshMember().catch(() => {});
    } catch (e) {
      setPrefs(previous);
      setError((e as Error).message || 'Could not save that. Please try again.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BAND_TOP }} edges={['top']}>
      <AppBar title="Notification Center" backgroundColor={BAND_TOP} tintColor="#fff" />
      <ScrollView style={{ flex: 1, backgroundColor: semantic.background }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40 }}>
        {error ? (
          <Text variant="caption" style={{ color: intent.danger.text, marginBottom: 12 }}>{error}</Text>
        ) : null}

        {CATEGORIES.map((c, i) => (
          <View
            key={c.key}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingVertical: 14,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: semantic.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ fontSize: 13.5 }}>{c.label}</Text>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>{c.sub}</Text>
            </View>
            <Switch
              value={prefs[c.key]}
              onValueChange={(v) => onToggle(c.key, v)}
              disabled={saving === c.key}
              trackColor={{ false: semantic.border, true: semantic.brand }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
