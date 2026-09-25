import { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Check, X, Flag } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { AppBar } from '@/components/shared/AppBar';
import { Alert } from '@/lib/alert';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useActiveGroup } from '@/context/GroupContext';
import { useLoanAudit } from '@/features/loanAudits/loanAudits.hooks';
import { ChecksPill } from '@/features/loanAudits/ChecksPill';
import { useFlagPosting } from '@/features/auditlog/auditlog.hooks';
import { useFlags } from '@/features/flags/flags.hooks';
import { FlagPrompt } from '@/features/flags/FlagPrompt';

const ROLE: Record<string, string> = { owner: 'Organizer', treasurer: 'Treasurer' };

function longDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={[{ backgroundColor: semantic.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 }, shadowToken.soft]}>{children}</View>;
}

export default function LoanAuditDetail() {
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id: string }>();
  const insets = useSafeAreaInsets();
  const { role } = useActiveGroup();
  const q = useLoanAudit(groupId!, id!);
  const flag = useFlagPosting(groupId!);
  const flags = useFlags(groupId!, 'open');
  const [flagging, setFlagging] = useState(false);
  const a = q.data;

  if (!a) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
        <AppBar title="Loan" backgroundColor={semantic.background} tintColor={semantic.textPrimary} />
        {q.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 40 }} /> : (
          <Text variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 40 }}>This loan couldn’t be found.</Text>
        )}
      </SafeAreaView>
    );
  }

  const decider = ROLE[a.decided_as ?? ''] ?? 'Organizer';
  const rate = a.interest_rate != null ? `${+(Number(a.interest_rate) * 100).toFixed(2)}% / month, ${a.term_months} mo` : null;
  const release = a.disbursed_at
    ? a.released_entry_ref ? `Released as ${a.released_entry_ref}` : `Released ${longDate(a.disbursed_at)}`
    : a.status === 'approved' ? 'Waiting for the Treasurer' : a.status;
  const rows = ([
    [`${decider}'s decision`, a.partial ? 'Partially approved' : 'Approved'],
    ['Decided by', [a.approver, longDate(a.approved_at)].filter(Boolean).join(', ')],
    ['Interest', rate],
    ['Release', release],
  ] as [string, string | null][]).filter(([, v]) => !!v) as [string, string][];
  const canFlag = role === 'auditor';
  // One open flag per decision — once raised, the button says so instead of inviting a duplicate.
  const openFlag = (flags.data ?? []).find((f) => f.entity_id === a.loan_id);
  const failed = a.failed > 0;

  async function onFlag(reason: string, note: string) {
    setFlagging(false);
    const ok = await flag.run({ entity_type: 'loan', entity_id: a!.loan_id, reason, note: note || undefined, label: `${a!.ref} · ${a!.borrower ?? 'Member'}` });
    if (ok === undefined) Alert.alert('Could not flag', flag.error?.message ?? 'Try again.');
    else Alert.alert('Flagged', 'The Organizer has been notified.');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title={`Loan ${a.ref}`} backgroundColor={semantic.background} tintColor={semantic.textPrimary} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: canFlag ? 110 : 40 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>
          {[a.head_name ? `${a.borrower} · ${a.head_name}` : a.borrower, a.purpose].filter(Boolean).join(', ')}
        </Text>
        <Text style={{ fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.8 }}>
          {formatPeso(a.approved_principal ?? a.principal)}
        </Text>
        <Text variant="caption" color="secondary">Requested {formatPeso(a.principal)}</Text>

        <View style={{ marginTop: 14 }}>
          <Card>
            {rows.map(([label, value], i) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 13, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <Text style={{ fontSize: 13, color: semantic.textSecondary }}>{label}</Text>
                <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{value}</Text>
              </View>
            ))}
          </Card>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 9 }}>
          <Text style={{ fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>Eligibility at approval</Text>
          <ChecksPill failed={a.failed} short />
        </View>
        <Card>
          {a.checks.map((c, i) => {
            const tone = c.passed ? intent.success : intent.danger;
            return (
              <View key={c.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: i < a.checks.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.passed ? tone.soft : tone.base, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {c.passed ? <Check size={12} color={tone.text} strokeWidth={3} /> : <X size={12} color="#fff" strokeWidth={3} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{c.label}</Text>
                  <Text style={{ fontSize: 11.5, color: c.passed ? semantic.textSecondary : intent.danger.text, marginTop: 1 }}>{c.detail}</Text>
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>

      {canFlag ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4 }}>
          {/* Filled when a check failed (the obvious next step), outlined otherwise, spent once a flag is open. */}
          <Pressable
            onPress={() => setFlagging(true)}
            disabled={flag.loading || !!openFlag}
            style={[{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16,
              backgroundColor: openFlag ? semantic.surfaceAlt : failed ? semantic.brandDark : semantic.surface,
              borderWidth: failed || openFlag ? 0 : 1, borderColor: semantic.border,
              opacity: flag.loading ? 0.6 : 1,
            }, openFlag ? null : shadowToken.soft]}
          >
            <Flag size={17} color={openFlag ? semantic.textSecondary : failed ? '#fff' : semantic.textPrimary} />
            <Text style={{ fontSize: 14, fontFamily: failed && !openFlag ? 'Poppins_700Bold' : 'Poppins_600SemiBold', color: openFlag ? semantic.textSecondary : failed ? '#fff' : semantic.textPrimary }}>
              {openFlag ? `Flagged as ${openFlag.ref}` : 'Flag this decision'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <FlagPrompt
        visible={flagging}
        title={`Flag ${a.ref}`}
        defaultReason={a.failed ? 'Broke a sign-off rule' : undefined}
        onCancel={() => setFlagging(false)}
        onConfirm={onFlag}
      />
    </SafeAreaView>
  );
}
