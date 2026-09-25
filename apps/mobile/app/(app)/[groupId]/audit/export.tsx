import { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { BandHeader } from '@/components/shared/DashboardBand';
import { DateInput, toIsoDate } from '@/components/shared/DateInput';
import { Alert } from '@/lib/alert';
import { semantic, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import {
  useAuditReport, exportAuditReport, SECTION_LABEL, PDF_EXPORT_ENABLED,
  type ReportSection, type ReportFormat, type ReportPeriod,
} from '@/features/auditlog/auditReport';

type PeriodKey = 'cycle' | 'month' | 'custom';

const SECTIONS: ReportSection[] = ['verified', 'rejected', 'flags', 'findings', 'loans'];

const FORMAT_HINT: Record<ReportFormat, string> = {
  pdf: PDF_EXPORT_ENABLED ? 'Best for sharing with the Organizer or printing.' : 'PDF is coming soon.',
  csv: 'Opens in Excel or Google Sheets.',
};

function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500', marginTop: 18, marginBottom: 8 }}>{children}</Text>;
}

export default function ExportAuditReport() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);

  const today = useMemo(() => new Date(), []);
  const monthStart = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const todayIso = toIsoDate(today);
  const monthName = today.toLocaleDateString('en-PH', { month: 'long' });

  const [periodKey, setPeriodKey] = useState<PeriodKey>('cycle');
  const [customFrom, setCustomFrom] = useState(monthStart);
  const [customTo, setCustomTo] = useState(todayIso);
  const [include, setInclude] = useState<ReportSection[]>(SECTIONS);
  const [format, setFormat] = useState<ReportFormat>(PDF_EXPORT_ENABLED ? 'pdf' : 'csv');
  const [exporting, setExporting] = useState(false);

  // Without an active cycle, "cycle" falls back to this month.
  const key = periodKey === 'cycle' && !cycle ? 'month' : periodKey;
  const period: ReportPeriod = key === 'cycle' && cycle
    ? { label: cycle.name, from: cycle.start_date, to: cycle.end_date && cycle.end_date < todayIso ? cycle.end_date : todayIso }
    : key === 'custom'
      ? { label: 'Custom period', from: customFrom <= customTo ? customFrom : customTo, to: customFrom <= customTo ? customTo : customFrom }
      : { label: `${monthName} ${today.getFullYear()}`, from: monthStart, to: todayIso };

  const report = useAuditReport(groupId!, period);
  const toggle = (s: ReportSection) => setInclude((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SECTIONS.filter((x) => x === s || cur.includes(x))));
  const canExport = !!report.data && include.length > 0 && !exporting;

  async function onExport() {
    if (!report.data) return;
    setExporting(true);
    try {
      await exportAuditReport({ groupName: group?.name ?? 'kapitpondo', period, data: report.data, include, format });
      if (report.data.truncated) Alert.alert('Report shortened', 'Only the most recent 5,000 audit entries fit in one export.');
    } catch (e) {
      Alert.alert('Could not export', (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['bottom']}>
      <BandHeader title="Export audit report" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <SectionLabel>Period</SectionLabel>
        <Segmented<PeriodKey>
          options={[
            ...(cycle ? [{ key: 'cycle' as const, label: cycle.name }] : []),
            { key: 'month', label: monthName },
            { key: 'custom', label: 'Custom' },
          ]}
          value={key}
          onChange={setPeriodKey}
        />
        {key === 'custom' ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}><DateInput label="From" value={customFrom} onChange={setCustomFrom} /></View>
            <View style={{ flex: 1 }}><DateInput label="To" value={customTo} onChange={setCustomTo} /></View>
          </View>
        ) : null}

        <SectionLabel>Include</SectionLabel>
        <View style={[{ backgroundColor: semantic.card, borderRadius: 14, overflow: 'hidden' }, shadowToken.soft]}>
          {SECTIONS.map((s, i) => {
            const n = report.counts?.[s];
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: i < SECTIONS.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ flex: 1 }}>
                  <Checkbox
                    checked={include.includes(s)}
                    onToggle={() => toggle(s)}
                    label={<Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{SECTION_LABEL[s]}</Text>}
                  />
                </View>
                <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{n ?? '…'}</Text>
              </View>
            );
          })}
        </View>

        <SectionLabel>Format</SectionLabel>
        <Segmented<ReportFormat>
          options={[{ key: 'pdf', label: 'PDF', disabled: !PDF_EXPORT_ENABLED }, { key: 'csv', label: 'CSV' }]}
          value={format}
          onChange={setFormat}
        />
        <Text variant="caption" color="secondary" style={{ marginTop: 8, marginLeft: 2 }}>{FORMAT_HINT[format]}</Text>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <Button label="Export report" onPress={onExport} loading={exporting} disabled={!canExport} />
      </View>
    </SafeAreaView>
  );
}
