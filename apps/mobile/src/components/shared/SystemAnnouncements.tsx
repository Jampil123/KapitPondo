/**
 * components/shared/SystemAnnouncements.tsx — the System Administrator's live
 * platform announcements (System Configuration), shown on My Groups.
 * A member can dismiss one; that's remembered on this device.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Megaphone, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { intent } from '@/theme/colors';
import { getSystemAnnouncements, type SystemAnnouncement } from '@/api/system';

const DISMISSED_KEY = 'dismissed_system_announcements_v1';

const TONE = {
  info: intent.info,
  warning: intent.warning,
  critical: intent.danger,
} as const;

/** `refreshKey` — bump it (e.g. on pull-to-refresh) to re-fetch. */
export function SystemAnnouncements({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<SystemAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [list, saved] = await Promise.all([getSystemAnnouncements(), AsyncStorage.getItem(DISMISSED_KEY)]);
      setItems(list);
      setDismissed(saved ? JSON.parse(saved) : []);
    } catch {
      // Announcements are optional — never block My Groups on them.
    }
  }, []);

  // load() sets state only after its awaits resolve, not synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load, refreshKey]);

  async function dismiss(id: string) {
    // Only keep ids that are still live, so the list doesn't grow forever.
    const next = [...dismissed, id].filter((d) => items.some((a) => a.id === d));
    setDismissed(next);
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next)).catch(() => {});
  }

  const visible = items.filter((a) => !dismissed.includes(a.id));
  if (!visible.length) return null;

  return (
    <View style={{ gap: 10, marginBottom: 16 }}>
      {visible.map((a) => {
        const t = TONE[a.tone] ?? intent.info;
        return (
          <View key={a.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: t.soft, borderRadius: 14, paddingVertical: 12, paddingLeft: 14, paddingRight: 8 }}>
            <Megaphone size={18} color={t.strong} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ color: t.strong }}>{a.title}</Text>
              <Text variant="caption" color="secondary">{a.body}</Text>
            </View>
            <Pressable onPress={() => dismiss(a.id)} hitSlop={10} accessibilityLabel="Dismiss announcement" style={{ padding: 4 }}>
              <X size={16} color={t.strong} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
