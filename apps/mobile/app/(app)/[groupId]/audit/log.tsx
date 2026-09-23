import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Search, ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { PillTabs } from '@/components/ui/PillTabs';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useAuditLog } from '@/features/auditlog/auditlog.hooks';
import { describe, ROLE_LABEL } from '@/features/auditlog/describe';
import type { AuditCategory, AuditLogEntry } from '@/api/auditLog';

type FilterKey = 'all' | AuditCategory;

const CATEGORY_ICON: Record<AuditCategory, { bg: string; fg: string; glyph: string }> = {
  money: { bg: intent.success.soft, fg: intent.success.text, glyph: '₱' },
  governance: { bg: semantic.surfaceAlt, fg: semantic.brandDark, glyph: '◆' },
  reversals: { bg: intent.warning.soft, fg: intent.warning.text, glyph: '↩' },
  settings: { bg: intent.info.soft, fg: intent.info.text, glyph: '⚙' },
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { weekday: undefined, month: 'long', day: 'numeric' });
}
function shortTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toDateString();
}

export default function AuditLog() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [category, setCategory] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allEntries, setAllEntries] = useState<AuditLogEntry[]>([]);

  const page = useAuditLog(groupId!, { category, search: search.trim() || undefined, before: cursor, limit: 30 });

  // Pages accumulate as "Load older" is tapped; a fresh filter/search resets.
  const entries = useMemo(() => {
    if (!cursor) return page.data ?? [];
    return [...allEntries, ...(page.data ?? [])];
  }, [page.data, cursor, allEntries]);

  function changeFilter(next: FilterKey) {
    setCategory(next);
    setCursor(undefined);
    setAllEntries([]);
  }
  function loadOlder() {
    const oldest = entries[entries.length - 1];
    if (!oldest) return;
    setAllEntries(entries);
    setCursor(oldest.created_at);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, AuditLogEntry[]>();
    for (const e of entries) {
      const key = dayKey(e.created_at);
      const list = map.get(key);
      if (list) list.push(e); else map.set(key, [e]);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Audit Log" subtitle="Auditor" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 4 }} keyboardShouldPersistTaps="handled">

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: semantic.surface, borderRadius: 14, paddingHorizontal: 14, height: 46 }}>
          <Search size={16} color={semantic.textMuted} />
          <TextInput
            value={search}
            onChangeText={(t) => { setSearch(t); setCursor(undefined); setAllEntries([]); }}
            placeholder="Search by action"
            placeholderTextColor={semantic.textMuted}
            style={{ flex: 1, fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}
          />
        </View>

        <View style={{ marginTop: 13 }}>
          <PillTabs<FilterKey>
            options={[
              { key: 'all', label: 'Everything' },
              { key: 'money', label: 'Money' },
              { key: 'governance', label: 'Governance' },
              { key: 'reversals', label: 'Reversals' },
              { key: 'settings', label: 'Settings' },
            ]}
            value={category}
            onChange={changeFilter}
          />
        </View>

        {page.loading && entries.length === 0 ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 30 }} />
        ) : entries.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text variant="body" color="muted">No entries yet.</Text>
          </View>
        ) : (
          grouped.map(([key, dayEntries]) => (
            <View key={key}>
              <Text variant="overline" color="muted" style={{ marginTop: 22, marginBottom: 10, marginLeft: 4 }}>{shortDate(dayEntries[0].created_at)}</Text>
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 20, overflow: 'hidden' }, shadowToken.card]}>
                {dayEntries.map((e, i) => {
                  const d = describe(e);
                  const cat = CATEGORY_ICON[e.category] ?? CATEGORY_ICON.governance;
                  return (
                    <View key={e.id} style={{ flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: i < dayEntries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: cat.bg, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                        <Text style={{ fontSize: 14, color: cat.fg }}>{cat.glyph}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="label" style={{ fontSize: 13.5 }}>{d.title}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <Text variant="caption" color="secondary">{e.actor?.full_name ?? 'Someone'}</Text>
                          {e.actor_role ? (
                            <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                              <Text style={{ fontSize: 9.5, fontFamily: 'Poppins_700Bold', color: semantic.brandDark, textTransform: 'uppercase', letterSpacing: 0.4 }}>{ROLE_LABEL[e.actor_role] ?? e.actor_role}</Text>
                            </View>
                          ) : null}
                        </View>
                        {d.from || d.to ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, padding: 9, backgroundColor: semantic.surfaceAlt, borderRadius: 10 }}>
                            {d.from ? <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: semantic.textMuted, textDecorationLine: 'line-through' }}>{d.from}</Text> : null}
                            {d.from && d.to ? <ArrowRight size={11} color={semantic.textMuted} /> : null}
                            {d.to ? <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_700Bold', color: d.toGood ? intent.success.text : d.toBad ? intent.danger.text : semantic.textPrimary }}>{d.to}</Text> : null}
                          </View>
                        ) : null}
                        {d.reason ? (
                          <View style={{ marginTop: 9, padding: 10, backgroundColor: intent.danger.soft, borderRadius: 10 }}>
                            <Text style={{ fontSize: 11.5, lineHeight: 16, color: '#8E3227', fontFamily: 'Poppins_500Medium' }}>Reason given: {d.reason}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" color="muted" style={{ fontSize: 10.5 }}>{shortTime(e.created_at)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {entries.length > 0 && (page.data?.length ?? 0) >= 30 ? (
          <Pressable onPress={loadOlder} disabled={page.loading} style={{ marginTop: 16, alignItems: 'center', paddingVertical: 13 }}>
            {page.loading && cursor ? <ActivityIndicator color={semantic.brand} /> : <Text variant="label" style={{ color: semantic.brandDark }}>Load older entries</Text>}
          </Pressable>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}
