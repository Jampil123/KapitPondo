/**
 * app/(app)/[groupId]/loans/disburse.tsx — Treasurer disbursement (M6).
 *
 * approve_loan and disburse_loan are separate steps (migration 0026, per
 * spec §1.2) — an Owner approving a loan on the Loan Decision screen leaves
 * it 'approved' and awaiting release, it does NOT post any money yet. THIS
 * screen is where that release actually happens: disburseLoan() posts a
 * debit ledger entry for the principal (see disburse_loan() SQL), which is
 * what deducts it from the group's available fund cash — group_available_cash
 * is just a live sum over ledger_entries, so the fund balance below updates
 * the instant a disbursement posts.
 *
 * This screen used to be read-only (a stale note claimed approve+disburse
 * were still fused into one call, and there was no button anywhere) even
 * though decisions.tsx's own inline Disburse button already exercised the
 * real, working endpoint — that's now mirrored here too, since this is the
 * Treasurer's actual dashboard entry point for it.
 */
import { useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Wallet, Coins, Banknote } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLoans, useLiquidity, useDisburseLoan } from '@/features/lending/lending.hooks';
import type { Loan } from '@/api/lending';

function loanName(l: Loan): string {
  return l.membership?.members?.full_name ?? 'Member';
}

export default function Disburse() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const liquidity = useLiquidity(groupId!);
  const loans = useLoans(groupId!, { status: 'approved' });
  const disburse = useDisburseLoan(groupId!);
  const [disbursingId, setDisbursingId] = useState<string | null>(null);

  const list = loans.data ?? [];
  const available = Number(liquidity.data?.available_cash ?? 0);

  async function onDisburse(l: Loan) {
    setDisbursingId(l.id);
    const ok = await disburse.run(l.id);
    setDisbursingId(null);
    if (ok !== undefined) { loans.refetch(); liquidity.refetch(); }
    else if (disburse.error) Alert.alert('Could not disburse', disburse.error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Disbursement" subtitle="Treasurer" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption" style={{ opacity: 0.7, color: semantic.textSecondary }}>Available fund balance</Text>
            {liquidity.loading ? <ActivityIndicator /> : <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold' }}>{formatPeso(available)}</Text>}
          </View>
          <Wallet size={26} color={semantic.brandDark} />
        </View>

        {loans.loading ? <ActivityIndicator color={semantic.brand} style={{ marginTop: 24 }} /> :
        list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 44, gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Coins size={26} color={semantic.textMuted} />
            </View>
            <Text variant="h3" style={{ fontSize: 16 }}>Nothing to release</Text>
            <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>All approved loans are already disbursed.</Text>
          </View>
        ) : list.map((l) => {
          const short = Number(l.approved_principal ?? l.principal) > available;
          const busy = disbursingId === l.id;
          return (
            <View key={l.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, gap: 12 }, shadowToken.card]}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Avatar name={loanName(l)} size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" style={{ fontSize: 14.5 }}>{loanName(l)}</Text>
                  <Text variant="caption" color="secondary">{l.purpose ?? '—'}</Text>
                </View>
                <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(l.approved_principal ?? l.principal)}</Text>
              </View>
              {short ? (
                <Text variant="caption" style={{ color: '#C25C5E' }}>Fund cash is short — this may fail until more cash is available.</Text>
              ) : null}
              <Pressable
                onPress={() => onDisburse(l)}
                disabled={busy}
                style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#E2F0E8', borderRadius: 12, paddingVertical: 11, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? <ActivityIndicator size="small" color="#3E8E66" /> : <Banknote size={16} color="#3E8E66" strokeWidth={2.4} />}
                <Text variant="label" style={{ color: '#3E8E66', fontSize: 13.5 }}>Disburse</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
