/**
 * app/(app)/[groupId]/loans/index.tsx — Loans overview (member).
 * Decision trail + repayment history so the member sees who approved/disbursed
 * their loan and who recorded/verified each repayment (spec §1.2 segregation
 * of duties, made visible). NOTE: approve+disburse are one fused backend
 * action (approve_and_disburse_loan RPC) — there's no separate "disbursed by"
 * to show, so the copy says "Approved & disbursed" rather than implying two
 * distinct actors/steps that don't exist in the schema.
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Coins, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLoans, useLoan } from '@/features/lending/lending.hooks';
import type { Loan, LoanPayment } from '@/api/lending';

function shortDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PaymentRow({ p }: { p: LoanPayment }) {
  return (
    <View style={{ paddingVertical: 10, gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="label" style={{ fontSize: 13.5 }}>{formatPeso(p.amount)}</Text>
        <StatusBadge entity="loan" value={p.status} />
      </View>
      <Text variant="caption" color="secondary">
        Principal {formatPeso(p.principal_portion)} · Interest {formatPeso(p.interest_portion)}
      </Text>
      <Text variant="caption" color="muted">
        Recorded by {p.recorder?.full_name ?? 'an officer'}
        {p.verifier ? `, verified by ${p.verifier.full_name}` : ''}
        {shortDate(p.paid_date) ? ` · ${shortDate(p.paid_date)}` : ''}
      </Text>
    </View>
  );
}

function PastLoanRow({ loan }: { loan: Loan }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="label" style={{ fontSize: 13.5 }}>{formatPeso(loan.principal)}</Text>
        <Text variant="caption" color="secondary">{loan.purpose ?? 'Loan'}</Text>
      </View>
      <StatusBadge entity="loan" value={loan.status} />
    </View>
  );
}

export default function LoansOverview() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const allLoans = useLoans(groupId!, {});
  const rows = allLoans.data ?? [];
  const activeLoan = rows.find((l) => l.status === 'active') ?? null;
  const pastLoans = rows.filter((l) => l.id !== activeLoan?.id);
  const detail = useLoan(groupId!, activeLoan?.id);
  const payments = detail.data?.payments ?? [];
  const [showPast, setShowPast] = useState(false);

  const go = (route: string) => router.push({ pathname: `/(app)/[groupId]/${route}` as any, params: { groupId } });

  const principal = Number(activeLoan?.principal ?? 0);
  const outstanding = Number(activeLoan?.outstanding_balance ?? 0);
  const paidPct = principal > 0 ? Math.round(((principal - outstanding) / principal) * 100) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Loans" subtitle="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {allLoans.loading ? (
          <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} />
        ) : activeLoan ? (
          <>
            <View style={[{ backgroundColor: semantic.surface, borderRadius: 18, padding: 16, gap: 10 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ gap: 2 }}>
                  <Text variant="caption" color="secondary">Active loan</Text>
                  <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(outstanding)}</Text>
                  <Text variant="caption" color="secondary">of {formatPeso(principal)} principal</Text>
                </View>
                <StatusBadge entity="loan" value={activeLoan.status} />
              </View>
              <View style={{ height: 7, borderRadius: 999, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' }}>
                <View style={{ width: `${paidPct}%`, height: '100%', backgroundColor: semantic.brand, borderRadius: 999 }} />
              </View>
              <Text variant="caption" color="secondary">
                {activeLoan.interest_rate ? `${(Number(activeLoan.interest_rate) * 100).toFixed(1)}% monthly interest` : 'Interest rate pending'}
              </Text>

              <View style={{ borderTopWidth: 1, borderColor: semantic.border, paddingTop: 10, gap: 4 }}>
                <Text variant="caption" color="secondary">Requested {shortDate(activeLoan.applied_at)}</Text>
                {activeLoan.approved_at ? (
                  <Text variant="caption" color="secondary">
                    Approved & disbursed by {activeLoan.approver?.full_name ?? 'an officer'} · {shortDate(activeLoan.approved_at)}
                  </Text>
                ) : (
                  <Text variant="caption" color="muted">Awaiting officer approval</Text>
                )}
              </View>
            </View>

            <View style={[{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 12 }]}>
              <Text variant="caption" color="secondary">
                Repayments are recorded by your treasurer once they receive your payment — send your proof of
                payment to them directly.
              </Text>
            </View>

            <Text variant="h3" style={{ fontSize: 15 }}>Repayment history</Text>
            {detail.loading ? (
              <ActivityIndicator color={semantic.brand} />
            ) : payments.length === 0 ? (
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center' }, shadowToken.card]}>
                <Text variant="body" color="muted">No repayments recorded yet.</Text>
              </View>
            ) : (
              <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, paddingHorizontal: 14 }, shadowToken.card]}>
                {payments.map((p, i) => (
                  <View key={p.id} style={{ borderBottomWidth: i < payments.length - 1 ? 1 : 0, borderColor: semantic.border }}>
                    <PaymentRow p={p} />
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10 }, shadowToken.card]}>
            <Text variant="body" color="muted">No active loan right now.</Text>
            <Button label="Request a loan" leading={<Coins size={18} color="#fff" />} onPress={() => go('loans/request')} />
          </View>
        )}

        {pastLoans.length > 0 && (
          <View style={[{ backgroundColor: semantic.surface, borderRadius: 16, paddingHorizontal: 14 }, shadowToken.card]}>
            <Pressable onPress={() => setShowPast((v) => !v)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }}>
              <Text variant="label" style={{ fontSize: 13.5 }}>Past loans ({pastLoans.length})</Text>
              {showPast ? <ChevronUp size={18} color={semantic.textMuted} /> : <ChevronDown size={18} color={semantic.textMuted} />}
            </Pressable>
            {showPast && pastLoans.map((loan, i) => (
              <View key={loan.id} style={{ borderTopWidth: 1, borderColor: semantic.border }}>
                <PastLoanRow loan={loan} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
