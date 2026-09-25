import { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Flag, FileText, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useFlags } from '@/features/flags/flags.hooks';
import { useFindings } from '@/features/findings/findings.hooks';
import { FlagStatusPill, recordLabel, statusLine } from '@/features/flags/flagStatus';
import type { AuditFlag } from '@/api/flags';
import type { AuditFinding } from '@/api/findings';

type Tab = 'flags' | 'findings';

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function ListCard({ children }: { children: React.ReactNode }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 20, marginTop: 14, overflow: 'hidden' }, shadowToken.soft]}>{children}</View>;
}

function Footnote({ children }: { children: string }) {
  return <Text style={{ fontSize: 11.5, lineHeight: 17, color: semantic.textSecondary, marginTop: 12, paddingHorizontal: 4 }}>{children}</Text>;
}

function FlagRow({ f, last, onPress }: { f: AuditFlag; last: boolean; onPress: () => void }) {
  const open = f.status === 'open';
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: open ? intent.danger.soft : semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Flag size={18} color={open ? intent.danger.text : semantic.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={1}>{f.reason}</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary, marginTop: 1 }} numberOfLines={1}>{f.ref} · {recordLabel(f)}</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary }} numberOfLines={2}>{statusLine(f)}</Text>
      </View>
      <FlagStatusPill status={f.status} />
    </Pressable>
  );
}

function FindingRow({ f, last }: { f: AuditFinding; last: boolean }) {
  const open = f.status === 'open';
  const tone = open ? intent.warning : intent.success;
  const flags = f.flag_ids?.length ?? 0;
  const meta = [f.ref, shortDate(f.created_at), flags ? `covers ${flags} flag${flags === 1 ? '' : 's'}` : null].filter(Boolean).join(', ');
  const body = open ? f.details : f.resolution_note ?? f.details;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: intent.info.soft, alignItems: 'center', justifyContent: 'center' }}>
        <FileText size={18} color={semantic.brandDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, lineHeight: 19, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{f.title}</Text>
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary, marginTop: 2 }}>{meta}</Text>
        {body ? <Text style={{ fontSize: 11.5, lineHeight: 16, color: semantic.textSecondary }} numberOfLines={3}>{body}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: tone.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.text }} />
        <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: tone.text }}>{open ? 'Submitted' : 'Closed'}</Text>
      </View>
    </View>
  );
}

export default function FlagsAndFindings() {
  const { groupId, tab: initialTab } = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const router = useRouter();
  const { role } = useActiveGroup();
  const [tab, setTab] = useState<Tab>(initialTab === 'findings' ? 'findings' : 'flags');

  const flags = useFlags(groupId!);
  const findings = useFindings(groupId!);

  const flagList = flags.data ?? [];
  const findingList = findings.data ?? [];
  const openFlags = flagList.filter((f) => f.status === 'open');
  const openFindings = findingList.filter((f) => f.status === 'open').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={[]}>
      <BandHeader title="Flags and findings" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Segmented<Tab>
          options={[
            { key: 'flags', label: 'Flags', count: openFlags.length || undefined },
            { key: 'findings', label: 'Audit findings', count: openFindings || undefined },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'flags' ? (
          <>
            <ListCard>
              {flags.loading && flagList.length === 0 ? (
                <ActivityIndicator color={semantic.brand} style={{ margin: 24 }} />
              ) : flagList.length === 0 ? (
                <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>No flags raised yet.</Text>
              ) : flagList.map((f, i) => (
                <FlagRow
                  key={f.id}
                  f={f}
                  last={i === flagList.length - 1}
                  onPress={() => router.push({ pathname: '/(app)/[groupId]/audit/flag/[id]' as any, params: { groupId, id: f.id } })}
                />
              ))}
            </ListCard>
            <Footnote>A flag points to one record. It is resolved when the Organizer approves the fix, or dismissed when the record turns out correct.</Footnote>
          </>
        ) : (
          <>
            <ListCard>
              {findings.loading && findingList.length === 0 ? (
                <ActivityIndicator color={semantic.brand} style={{ margin: 24 }} />
              ) : findingList.length === 0 ? (
                <Text variant="body" color="muted" style={{ padding: 18, textAlign: 'center' }}>No findings submitted yet.</Text>
              ) : findingList.map((f, i) => (
                <FindingRow key={f.id} f={f} last={i === findingList.length - 1} />
              ))}
            </ListCard>
            <Footnote>A finding is your formal report to the Organizer. Only the Organizer can close it.</Footnote>

            {role === 'auditor' ? (
              <Pressable
                onPress={() => router.push({ pathname: '/(app)/[groupId]/audit/new-finding' as any, params: { groupId } })}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingVertical: 15, borderRadius: 14, backgroundColor: semantic.brandDark }}
              >
                <Plus size={18} color="#fff" strokeWidth={2.4} />
                <Text style={{ fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' }}>New audit finding</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}
