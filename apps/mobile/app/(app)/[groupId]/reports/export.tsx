import { useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { BandHeader } from '@/components/shared/DashboardBand';
import { DateInput, toIsoDate } from '@/components/shared/DateInput';
import { Alert } from '@/lib/alert';
import { formatPeso } from '@/lib/money';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { useActiveGroup } from '@/context/GroupContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useAuditReport, exportAuditReport, SECTION_LABEL, type ReportSection, type ReportPeriod } from '@/features/auditlog/auditReport';
import { useFinancialReport, exportFinancialReport, typeLabel, type FinancialReport } from '@/features/reporting/financialReport';

type PeriodKey = 'cycle' | 'month' | 'custom';
type ReportType = 'financial' | 'audit';

const SECTIONS: ReportSection[] = ['verified', 'rejected', 'flags', 'findings', 'loans'];

function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500', marginTop: 18, marginBottom: 8 }}>{children}</Text>;
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'in' | 'out' }) {
  const color = tone === 'in' ? intent.success.text : tone === 'out' ? intent.danger.text : semantic.textPrimary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4 }}>
      <Text variant={bold ? 'label' : 'caption'} color={bold ? undefined : 'secondary'} style={{ flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: bold ? 15 : 13, fontFamily: 'Poppins_700Bold', color }}>{value}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 14, padding: 14 }, shadowToken.soft]}>{children}</View>;
}

function FinancialPreview({ r }: { r: FinancialReport }) {
  return (
    <View style={{ gap: 10 }}>
      <Card>
        <Row label="Cash at start" value={formatPeso(r.cash.opening)} />
        <Row label="Money in" value={`+ ${formatPeso(r.cash.money_in)}`} tone="in" />
        <Row label="Money out" value={`− ${formatPeso(r.cash.money_out)}`} tone="out" />
        <View style={{ borderTopWidth: 1, borderColor: semantic.border, marginTop: 4, paddingTop: 4 }}>
          <Row label="Cash at end" value={formatPeso(r.cash.closing)} bold />
        </View>
      </Card>
      {Object.keys(r.money_in).length + Object.keys(r.money_out).length > 0 ? (
        <Card>
          {Object.entries(r.money_in).map(([t, v]) => <Row key={`in-${t}`} label={typeLabel(t)} value={`+ ${formatPeso(v ?? 0)}`} tone="in" />)}
          {Object.entries(r.money_out).map(([t, v]) => <Row key={`out-${t}`} label={typeLabel(t)} value={`− ${formatPeso(v ?? 0)}`} tone="out" />)}
        </Card>
      ) : null}
      <Card>
        <Row label="Interest earned" value={formatPeso(r.loans.interest_earned)} />
        <Row label={`Still owed on ${r.loans.active_count} loan${r.loans.active_count === 1 ? '' : 's'}`} value={formatPeso(r.loans.outstanding)} />
        <Row label="Unpaid penalties" value={formatPeso(r.penalties.pending)} />
      </Card>
      <Text variant="caption" color="muted" style={{ marginLeft: 2 }}>The export also lists every member's contributions, loan and penalties.</Text>
    </View>
  );
}

export default function ReportsExport() {
  const { groupId, type: initialType } = useLocalSearchParams<{ groupId: string; type?: string }>();
  const { group, role } = useActiveGroup();
  const { cycle } = useActiveCycle(groupId!);
  const isAuditor = role === 'auditor';

  const today = useMemo(() => new Date(), []);
  const monthStart = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const todayIso = toIsoDate(today);
  const monthName = today.toLocaleDateString('en-PH', { month: 'long' });

  const [type, setType] = useState<ReportType>(isAuditor && initialType === 'audit' ? 'audit' : 'financial');
  const [periodKey, setPeriodKey] = useState<PeriodKey>('cycle');
  const [customFrom, setCustomFrom] = useState(monthStart);
  const [customTo, setCustomTo] = useState(todayIso);
  const [include, setInclude] = useState<ReportSection[]>(SECTIONS);
  const [exporting, setExporting] = useState(false);

  // Without an active cycle, "cycle" falls back to this month.
  const key = periodKey === 'cycle' && !cycle ? 'month' : periodKey;
  const period: ReportPeriod = key === 'cycle' && cycle
    ? { label: cycle.name, from: cycle.start_date, to: cycle.end_date && cycle.end_date < todayIso ? cycle.end_date : todayIso }
    : key === 'custom'
      ? { label: 'Custom period', from: customFrom <= customTo ? customFrom : customTo, to: customFrom <= customTo ? customTo : customFrom }
      : { label: `${monthName} ${today.getFullYear()}`, from: monthStart, to: todayIso };

  const financial = useFinancialReport(groupId!, period);
  const audit = useAuditReport(isAuditor ? groupId! : '', period);
  const toggle = (s: ReportSection) => setInclude((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SECTIONS.filter((x) => x === s || cur.includes(x))));

  const ready = type === 'financial' ? !!financial.data : !!audit.data && include.length > 0;
  const loadError = type === 'financial' ? financial.error : audit.error;

  async function onExport() {
    setExporting(true);
    try {
      const groupName = group?.name ?? 'kapitpondo';
      if (type === 'financial' && financial.data) {
        await exportFinancialReport({ groupName, period, data: financial.data });
      } else if (type === 'audit' && audit.data) {
        await exportAuditReport({ groupName, period, data: audit.data, include, format: 'csv' });
        if (audit.data.truncated) Alert.alert('Report shortened', 'Only the most recent 5,000 audit entries fit in one export.');
      }
    } catch (e) {
      Alert.alert('Could not export', (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['bottom']}>
      <BandHeader title="Reports & Export" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {isAuditor ? (
          <>
            <SectionLabel>Report</SectionLabel>
            <Segmented<ReportType>
              options={[{ key: 'financial', label: 'Financial report' }, { key: 'audit', label: 'Audit report' }]}
              value={type}
              onChange={setType}
            />
          </>
        ) : null}

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

        {type === 'financial' ? (
          <>
            <SectionLabel>Summary</SectionLabel>
            {financial.data ? <FinancialPreview r={financial.data} /> : loadError ? null : <ActivityIndicator color={semantic.brand} style={{ marginTop: 10 }} />}
          </>
        ) : (
          <>
            <SectionLabel>Include</SectionLabel>
            <View style={[{ backgroundColor: semantic.card, borderRadius: 14, overflow: 'hidden' }, shadowToken.soft]}>
              {SECTIONS.map((s, i) => (
                <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: i < SECTIONS.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                  <View style={{ flex: 1 }}>
                    <Checkbox
                      checked={include.includes(s)}
                      onToggle={() => toggle(s)}
                      label={<Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{SECTION_LABEL[s]}</Text>}
                    />
                  </View>
                  <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{audit.counts?.[s] ?? '…'}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {loadError ? <Text variant="caption" style={{ color: intent.danger.text, marginTop: 10 }}>{loadError.message}</Text> : null}
        <Text variant="caption" color="secondary" style={{ marginTop: 14, marginLeft: 2 }}>Exports as a CSV file that opens in Excel or Google Sheets.</Text>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <Button label="Export report" onPress={onExport} loading={exporting} disabled={!ready || exporting} />
      </View>
    </SafeAreaView>
  );
}
