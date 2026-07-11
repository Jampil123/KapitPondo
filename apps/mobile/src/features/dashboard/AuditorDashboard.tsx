import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, ScrollText, Flag, Repeat, Receipt, CalendarClock, FileText, Check, ArrowUpRight, ArrowDownRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLedger } from '@/features/reporting/reporting.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useExpenses } from '@/features/expenses/expenses.hooks';

function soon(l: string) { Alert.alert(l, 'Coming soon.'); }
function SectionTitle({ title }: { title: string }) {
  return <Text variant="h3" style={{ fontSize: 15 }}>{title}</Text>;
}

const TONE = {
  accent: { bg: '#EAF2F6', fg: '#5E8497', dot: '#7FA6B8' },
  warn: { bg: '#F8EFDA', fg: '#A87C2C', dot: '#A87C2C' },
  danger: { bg: '#F7E5E5', fg: '#C25C5E', dot: '#C25C5E' },
} as const;

function StatTile({ icon: Icon, count, label, tone, onPress }: { icon: any; count: number; label: string; tone: keyof typeof TONE; onPress: () => void }) {
  const t = TONE[tone];
  return (
    <Pressable onPress={onPress} style={[{ flex: 1, backgroundColor: semantic.surface, borderRadius: 16, padding: 13 }, shadowToken.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={t.fg} strokeWidth={1.8} />
        </View>
        {count > 0 ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot }} /> : null}
      </View>
      <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, lineHeight: 28 }}>{count}</Text>
      <Text variant="caption" color="secondary" style={{ marginTop: 3 }}>{label}</Text>
    </Pressable>
  );
}

const ACTIONS: { label: string; icon: any; route?: string }[] = [
  { label: 'Review Postings', icon: ScrollText, route: 'audit/postings' },
  { label: 'Review Proofs', icon: Receipt, route: 'audit/proofs' },
  { label: 'Flag Discrepancies', icon: Flag },
  { label: 'Verify Reversals', icon: Repeat },
  { label: 'Verify Year-End', icon: CalendarClock, route: 'distribution/year-end' },
  { label: 'Audit Log', icon: FileText, route: 'reports/group-ledger' },
];

export function AuditorDashboard({ groupId }: { groupId: string }) {
  const router = useRouter();
  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });

  const pendingContribs = useContributions(groupId, { status: 'submitted' });
  const pendingExpenses = useExpenses(groupId, { status: 'submitted' });
  const ledger = useLedger(groupId, { limit: 5 });

  const postings = (pendingContribs.data?.length ?? 0) + (pendingExpenses.data?.length ?? 0);
  const flags = 0;     // no discrepancy/flag API
  const reversals = 0; // reversal is owner-only; no auditor-verify step
  const txns = ledger.data ?? [];

  return (
    <>
      {/* Integrity hero */}
      <View style={{ borderRadius: 20, padding: 18, backgroundColor: semantic.dashCard, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={24} color="#fff" />
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="label" style={{ color: '#fff', fontSize: 14 }}>Ledger integrity</Text>
            <Text variant="caption" style={{ color: '#fff', opacity: 0.65 }}>Every posting reconciles to the balance</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {[['Awaiting verify', postings], ['Open flags', flags], ['Reversals', reversals]].map(([k, v], i) => (
            <View key={String(k)} style={{ flex: 1, borderLeftWidth: i > 0 ? 1 : 0, borderColor: 'rgba(255,255,255,0.14)', paddingLeft: i > 0 ? 14 : 0 }}>
              <Text style={{ fontSize: 24, fontFamily: 'Poppins_700Bold', color: '#fff' }}>{v}</Text>
              <Text style={{ fontSize: 10.5, color: '#fff', opacity: 0.7, marginTop: 2 }}>{k}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatTile icon={ScrollText} count={postings} label="Postings to verify" tone="warn" onPress={() => go('audit/postings')} />
        <StatTile icon={Flag} count={flags} label="Open discrepancies" tone="danger" onPress={() => soon('Flag Discrepancy')} />
        <StatTile icon={Repeat} count={reversals} label="Reversals to verify" tone="accent" onPress={() => soon('Verify Reversals')} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ACTIONS.map((a) => (
          <Pressable key={a.label} onPress={() => (a.route ? go(a.route) : soon(a.label))} style={{ width: '30.5%', alignItems: 'center', gap: 8 }}>
            <View style={[{ width: 62, height: 62, borderRadius: 16, backgroundColor: semantic.surface, alignItems: 'center', justifyContent: 'center' }, shadowToken.card]}>
              <a.icon size={25} color={semantic.brandDark} strokeWidth={1.8} />
            </View>
            <Text variant="caption" style={{ textAlign: 'center' }} numberOfLines={2}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Recent verifications" />
      <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: txns.length ? 6 : 20 }, shadowToken.card]}>
        {ledger.loading ? <ActivityIndicator color={semantic.brand} /> :
        txns.length === 0 ? <Text variant="body" color="muted" style={{ textAlign: 'center' }}>No verifications yet.</Text> :
        txns.map((e, i) => {
          const credit = e.direction === 'credit';
          return (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderBottomWidth: i < txns.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: '#E2F0E8', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={16} color="#3E8E66" strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="label" style={{ fontSize: 12.5 }} numberOfLines={1}>{e.description ?? e.entry_type.replace(/_/g, ' ')}</Text>
                <Text variant="caption" color="secondary">{new Date(e.posted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</Text>
              </View>
              {credit ? <ArrowDownRight size={17} color="#3E8E66" /> : <ArrowUpRight size={17} color="#C25C5E" />}
            </View>
          );
        })}
      </View>
    </>
  );
}
