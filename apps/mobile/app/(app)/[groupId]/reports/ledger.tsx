/**
 * app/(app)/[groupId]/ledger.tsx — member's ledger & reports (M8).
 * Ledger tab: real personal ledger feed (useLedger — members see own entries).
 * Reports tab: the stats we can actually compute from useMyBalance; the design's
 * monthly bar chart + projected year-end share need aggregates our API doesn't
 * expose yet, so those are noted rather than faked.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Search, ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLedger, useMyBalance } from '@/features/reporting/reporting.hooks';
import type { LedgerEntry } from '@/api/ledger';

type Tab = 'ledger' | 'reports';

function shortDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function LedgerRow({ e }: { e: LedgerEntry }) {
  const credit = e.direction === 'credit';
  const Icon = credit ? ArrowDownRight : ArrowUpRight;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: credit ? '#E2F0E8' : '#F7E5E5', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={credit ? '#3E8E66' : '#C25C5E'} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" style={{ fontSize: 13 }} numberOfLines={1}>{e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
        <Text variant="caption" color="secondary">{shortDate(e.posted_at)}</Text>
      </View>
      <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 13.5, color: credit ? '#3E8E66' : '#C25C5E' }}>
        {credit ? '+' : '-'}{formatPeso(e.amount)}
      </Text>
    </View>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: semantic.surface, borderRadius: 14, padding: 14, gap: 6 }, shadowToken.card]}>
      <Text style={{ fontSize: 19, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{value}</Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </View>
  );
}

export default function Ledger() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [tab, setTab] = useState<Tab>('ledger');
  const [query, setQuery] = useState('');

  const ledger = useLedger(groupId!, {});
  const bal = useMyBalance(groupId!);

  const entries = useMemo(() => {
    const all = ledger.data ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((e) => (e.description ?? e.entry_type).toLowerCase().includes(q)) : all;
  }, [ledger.data, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="My Ledger & Reports" subtitle="Member" />
      <View style={{ padding: 16, gap: 14, flex: 1 }}>
        <Segmented<Tab>
          options={[{ key: 'ledger', label: 'Ledger' }, { key: 'reports', label: 'Reports' }]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'ledger' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: semantic.surfaceAlt, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10 }}>
              <Search size={17} color={semantic.textMuted} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={semantic.textMuted} style={{ flex: 1, fontSize: 13, color: semantic.textPrimary, padding: 0 }} />
            </View>
            {ledger.loading ? (
              <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
            ) : entries.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
                <Text variant="h3" style={{ fontSize: 16 }}>No entries yet</Text>
                <Text variant="body" color="secondary">Your ledger activity will appear here.</Text>
              </View>
            ) : (
              <ScrollView>
                <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 6 }, shadowToken.card]}>
                  {entries.map((e, i) => (
                    <View key={e.id} style={{ borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                      <LedgerRow e={e} />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <ReportStat label="Total contributed" value={formatPeso(bal.data?.contributions)} />
              <ReportStat label="Loan outstanding" value={formatPeso(bal.data?.loan_outstanding)} />
            </View>
            <ReportStat label="My net balance" value={formatPeso(bal.data?.balance)} />
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
              <Text variant="body" color="muted" style={{ textAlign: 'center' }}>
                Monthly charts and your projected year-end share will appear here once those figures are available from the server.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
