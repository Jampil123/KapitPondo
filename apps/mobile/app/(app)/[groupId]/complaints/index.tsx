import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, MessageSquareWarning, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { BandHeader } from '@/components/shared/DashboardBand';
import { semantic, intent, shadowToken, type IntentName } from '@/theme/colors';
import { useQuery } from '@/hooks/useApi';
import { listMyProblemReports, listProblemCategories, type MyProblemReport, type ProblemStatus } from '@/api/problemReports';

const STATUS: Record<ProblemStatus, { label: string; tone: IntentName }> = {
  new: { label: 'Sent', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'info' },
  investigating: { label: 'Investigating', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

const RESOLUTION: Record<string, string> = {
  resolved: 'Resolved by the administrator',
  referred_to_group: "Referred to your group's officers",
  no_action: 'No action needed',
  duplicate: 'Duplicate of another report',
};

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReportRow({ r, categoryLabel, last }: { r: MyProblemReport; categoryLabel: string; last: boolean }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[r.status] ?? STATUS.new;
  const t = intent[s.tone];
  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={{ paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }} numberOfLines={open ? undefined : 1}>{r.subject}</Text>
          <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
            {categoryLabel} · {shortDate(r.created_at)}
          </Text>
        </View>
        <View style={{ backgroundColor: t.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.text }}>{s.label}</Text>
        </View>
        {open ? <ChevronUp size={17} color={semantic.textMuted} /> : <ChevronDown size={17} color={semantic.textMuted} />}
      </View>
      {open ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          <Text variant="bodySmall" style={{ color: semantic.textPrimary, lineHeight: 19 }}>{r.description}</Text>
          {r.group_name ? <Text variant="caption" color="muted">Group: {r.group_name}</Text> : null}
          {r.resolution ? (
            <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12, gap: 3 }}>
              <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{RESOLUTION[r.resolution] ?? r.resolution}</Text>
              {r.resolution_note ? <Text variant="caption" color="secondary" style={{ lineHeight: 17 }}>{r.resolution_note}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function Complaints() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const reports = useQuery(listMyProblemReports, []);
  const categories = useQuery(listProblemCategories, []);

  // Pick up a complaint just filed on the next screen.
  const { refetch } = reports;
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const label = (key: string) => categories.data?.find((c) => c.key === key)?.label ?? key.replace(/_/g, ' ');
  const list = reports.data ?? [];
  const fileNew = () => router.push({ pathname: '/(app)/[groupId]/complaints/new' as any, params: { groupId } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['bottom']}>
      <BandHeader
        title="Complaints"
        right={list.length > 0 ? (
          <Pressable onPress={fileNew} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.textPrimary, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={18} color="#fff" />
          </Pressable>
        ) : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {reports.loading && !reports.data ? (
          <ActivityIndicator color={semantic.brandDark} style={{ marginTop: 40 }} />
        ) : reports.error ? (
          <Text variant="bodySmall" style={{ color: intent.danger.text, textAlign: 'center', marginTop: 40 }}>{reports.error.message}</Text>
        ) : list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 16, gap: 10 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquareWarning size={32} color={semantic.brandDark} />
            </View>
            <Text variant="h3" style={{ fontSize: 16, textAlign: 'center' }}>No complaints filed</Text>
            <Text variant="bodySmall" color="secondary" style={{ textAlign: 'center', marginBottom: 14 }}>
              The System Administrator reviews each one.
            </Text>
            <View style={{ alignSelf: 'stretch' }}><Button label="File a complaint" onPress={fileNew} /></View>
          </View>
        ) : (
          <View style={[{ backgroundColor: semantic.card, borderRadius: 20, overflow: 'hidden' }, shadowToken.soft]}>
            {list.map((r, i) => <ReportRow key={r.id} r={r} categoryLabel={label(r.category)} last={i === list.length - 1} />)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
