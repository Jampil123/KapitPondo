import { useState } from 'react';
import { View, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Flag } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { ReasonPrompt } from '@/components/ui/ReasonPrompt';
import { CloseHeader } from '@/features/payments/PaymentPage';
import { toast } from '@/components/ui/Toast';
import { Alert } from '@/lib/alert';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { parseApiDate } from '@/lib/cycle';
import { useQuery } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useActiveCycle } from '@/features/cycles/cycles.hooks';
import { useContributions } from '@/features/contributions/contributions.hooks';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { ROLE_LABEL } from '@/features/auditlog/describe';
import { PAYMENT_METHOD_LABEL } from './entryCopy';
import { listMemberDirectory } from '@/api/groups';
import { fileProblemReport } from '@/api/problemReports';
import { entryRef, type LedgerEntry } from '@/api/ledger';

const STEP = intent.success.strong;

function longDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = parseApiDate(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "June 2026" for a monthly cycle; the due date otherwise. */
function periodTitle(dueDate: string | null | undefined, frequency: string | undefined) {
  if (!dueDate) return null;
  const d = parseApiDate(dueDate);
  if (isNaN(d.getTime())) return null;
  if (!frequency || frequency === 'monthly') return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  return `Due ${longDate(dueDate)}`;
}

function Step({ title, sub, last }: { title: string; sub?: string | null; last: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ width: 26, alignItems: 'center' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: STEP, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={14} color="#fff" strokeWidth={3} />
        </View>
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: intent.success.soft, marginVertical: 3 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingTop: 2, paddingBottom: last ? 0 : 18 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 11.5, color: semantic.textSecondary, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ backgroundColor: semantic.card, borderRadius: 18, borderWidth: 1, borderColor: semantic.border }, shadowToken.soft, style]}>
      {children}
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 22, marginBottom: 10 }}>{title}</Text>;
}

/** The contribution receipt: amount and status, the sign-off steps it went through, and its payment details. */
export function ContributionDetail({ entry, onBack }: { entry: LedgerEntry; onBack: () => void }) {
  const { member } = useAuth();
  const { cycle } = useActiveCycle(entry.group_id);
  const contributions = useContributions(entry.group_id, {});
  const directory = useQuery(() => listMemberDirectory(entry.group_id), [entry.group_id]);
  const c = contributions.data?.find((x) => x.id === entry.source_id) ?? null;
  const proofUrl = useSignedProofUrl(c?.proof_url);
  const [reporting, setReporting] = useState(false);

  const roleOf = (memberId: string | null | undefined) => {
    const role = directory.data?.find((m) => m.member_id === memberId)?.role;
    return role ? ROLE_LABEL[role] : null;
  };
  const withRole = (name: string | null | undefined, memberId: string | null | undefined) => {
    if (!name) return null;
    const role = roleOf(memberId);
    return role ? `${name}, ${role}` : name;
  };

  const ref = entryRef(entry);
  const payerMemberId = entry.membership?.member_id;
  const payerName = entry.membership?.members?.full_name ?? 'the member';
  const mine = !!member && payerMemberId === member.id;
  const period = periodTitle(c?.due_date, cycle?.frequency);

  const submittedTitle = c?.is_walk_in
    ? `Recorded by ${c.recorder?.full_name ?? 'an officer'}`
    : mine ? 'Submitted by you' : `Submitted by ${payerName}`;

  const steps = [
    { title: submittedTitle, sub: longDate(c?.created_at) },
    entry.confirmer ? { title: 'Payment received', sub: `Confirmed by ${withRole(entry.confirmer.full_name, c?.confirmed_by)}` } : null,
    entry.poster ? { title: 'Verified', sub: `By ${withRole(entry.poster.full_name, entry.posted_by)}` } : null,
    { title: 'Posted to the group ledger', sub: `Entry ${ref}` },
  ].filter((s): s is { title: string; sub: string | null } => !!s);

  const details: [string, string | null][] = [
    ['Date paid', longDate(c?.paid_date ?? entry.posted_at)],
    ['Channel', c?.payment_method ? PAYMENT_METHOD_LABEL[c.payment_method] : null],
    ['Reference no.', c?.external_reference ?? null],
    ['Late penalty', c && Number(c.penalty_applied) > 0 ? formatPeso(c.penalty_applied) : null],
    ['Ledger entry', ref],
  ];
  const shownDetails = details.filter(([, v]) => v);

  async function onReport(description: string) {
    setReporting(false);
    try {
      await fileProblemReport({
        category: 'other',
        subject: `Contribution ${ref}${period ? ` (${period})` : ''}`,
        description,
        group_id: entry.group_id,
      });
      toast('Report sent. We’ll look into it.');
    } catch (e) {
      Alert.alert('Could not send the report', (e as Error).message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'bottom']}>
      <CloseHeader title="Contribution" onClose={onBack} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {period ? <Text style={{ fontSize: 12.5, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{period}</Text> : null}
        <Text style={{ fontSize: 32, fontFamily: 'Poppins_700Bold', letterSpacing: -1, color: semantic.textPrimary, marginTop: 2 }}>
          {formatPeso(entry.amount)}
        </Text>
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: intent.success.soft, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, marginTop: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: STEP }} />
          <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: STEP }}>Verified</Text>
        </View>

        <SectionTitle title="Progress" />
        <Card style={{ padding: 16 }}>
          {steps.map((s, i) => <Step key={s.title} title={s.title} sub={s.sub} last={i === steps.length - 1} />)}
        </Card>

        <SectionTitle title="Details" />
        <Card style={{ paddingHorizontal: 16 }}>
          {shownDetails.map(([label, value], i) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: i < shownDetails.length - 1 ? 1 : 0, borderColor: semantic.border }}>
              <Text style={{ flex: 1, fontSize: 13, color: semantic.textSecondary }}>{label}</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{value}</Text>
            </View>
          ))}
        </Card>

        {c?.proof_url ? (
          <>
            <SectionTitle title="Proof of payment" />
            {proofUrl ? (
              <Image source={{ uri: proofUrl }} style={{ width: '100%', height: 200, borderRadius: 18, backgroundColor: semantic.surfaceAlt }} resizeMode="cover" />
            ) : (
              <View style={{ height: 200, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={semantic.brand} />
              </View>
            )}
          </>
        ) : null}

        <Pressable onPress={() => setReporting(true)} style={{ marginTop: 22 }}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 }}>
            <Flag size={17} color={semantic.textPrimary} />
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Report a problem</Text>
          </Card>
        </Pressable>
      </ScrollView>

      <ReasonPrompt
        visible={reporting}
        title="Report a problem"
        placeholder="What's wrong with this contribution?"
        confirmLabel="Send report"
        required
        onConfirm={onReport}
        onCancel={() => setReporting(false)}
      />
    </SafeAreaView>
  );
}
