import { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Alert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Wallet, Coins, Banknote, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { AppBar } from '@/components/shared/AppBar';
import { semantic, intent, shadowToken } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { useLoans, useLiquidity, useDisburseLoan } from '@/features/lending/lending.hooks';
import type { Loan } from '@/api/lending';

function loanName(l: Loan): string {
  return l.membership?.members?.full_name ?? 'Member';
}
function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionHead({ title, aside }: { title: string; aside?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text style={{ fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{title}</Text>
      {aside ? <Text variant="caption" color="secondary" style={{ fontFamily: 'Poppins_600SemiBold' }}>{aside}</Text> : null}
    </View>
  );
}

export default function Disburse() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const liquidity = useLiquidity(groupId!);
  const loans = useLoans(groupId!, { status: 'approved' });
  const disburse = useDisburseLoan(groupId!);
  const [disbursingId, setDisbursingId] = useState<string | null>(null);

  const list = loans.data ?? [];
  const available = Number(liquidity.data?.available_cash ?? 0);
  const totalToRelease = useMemo(() => list.reduce((s, l) => s + Number(l.approved_principal ?? l.principal), 0), [list]);
  const coversAll = available >= totalToRelease;

  // Releasing posts a real ledger debit the instant it runs, with no undo
  // from this screen — worth a confirmation, same as the approval dialog.
  function onDisbursePress(l: Loan) {
    const amount = Number(l.approved_principal ?? l.principal);
    Alert.alert(
      'Release these funds?',
      `${formatPeso(amount)} to ${loanName(l)}. This posts to the ledger immediately and can't be undone from here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', onPress: () => onDisburse(l) },
      ],
    );
  }

  async function onDisburse(l: Loan) {
    setDisbursingId(l.id);
    const ok = await disburse.run(l.id);
    setDisbursingId(null);
    if (ok !== undefined) { loans.refetch(); liquidity.refetch(); }
    else if (disburse.error) Alert.alert('Could not disburse', disburse.error.message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top']}>
      <AppBar title="Disbursement" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Text variant="caption" style={{ opacity: 0.7, color: semantic.textSecondary }}>Available fund balance</Text>
              {liquidity.loading ? <ActivityIndicator /> : <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold' }}>{formatPeso(available)}</Text>}
            </View>
            <Wallet size={26} color={semantic.brandDark} />
          </View>
          {list.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: semantic.border }}>
              <Text variant="caption" color="secondary">{list.length} loan{list.length === 1 ? '' : 's'} waiting · {formatPeso(totalToRelease)} total</Text>
              {!coversAll ? (
                <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={13} color={intent.danger.text} />
                  <Text variant="caption" style={{ color: intent.danger.text, fontFamily: 'Poppins_700Bold' }}>Short by {formatPeso(totalToRelease - available)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
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
        ) : (
          <>
            <SectionHead title="Ready to release" aside={`${list.length} approved`} />
            {list.map((l) => {
              const amount = Number(l.approved_principal ?? l.principal);
              const partial = l.approved_principal != null && Number(l.approved_principal) !== Number(l.principal);
              const short = amount > available;
              const busy = disbursingId === l.id;
              return (
                <View key={l.id} style={[{ backgroundColor: semantic.surface, borderRadius: 16, padding: 14, gap: 10 }, shadowToken.card]}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <Avatar name={loanName(l)} uri={l.membership?.members?.avatar_url} size={44} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text variant="label" style={{ fontSize: 14.5 }}>{loanName(l)}</Text>
                        {l.membership?.role === 'owner' ? (
                          <View style={{ backgroundColor: semantic.surfaceAlt, paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 20 }}>
                            <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: semantic.brandDark }}>Organizer's request</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" color="secondary">{l.purpose ?? 'No purpose given'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontSize: 16, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary }}>{formatPeso(amount)}</Text>
                      {partial ? <Text variant="caption" style={{ color: intent.warning.text }}>partial</Text> : null}
                    </View>
                  </View>

                  <View style={{ gap: 3, paddingTop: 10, borderTopWidth: 1, borderColor: semantic.border }}>
                    <Text variant="caption" color="secondary">
                      {l.term_months} month{l.term_months === 1 ? '' : 's'}{l.interest_rate ? ` · ${(Number(l.interest_rate) * 100).toFixed(2)}% monthly` : ''}
                    </Text>
                    <Text variant="caption" color="muted">
                      Approved {shortDate(l.approved_at)}{l.approver?.full_name ? ` by ${l.approver.full_name}` : ''}
                    </Text>
                  </View>

                  {short ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: intent.danger.soft, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 }}>
                      <AlertTriangle size={13} color={intent.danger.text} />
                      <Text variant="caption" style={{ color: intent.danger.text, flex: 1 }}>Fund cash is short — this may fail until more cash is available.</Text>
                    </View>
                  ) : null}

                  <Pressable
                    onPress={() => onDisbursePress(l)}
                    disabled={busy}
                    style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: '#E2F0E8', borderRadius: 12, paddingVertical: 11, opacity: busy ? 0.6 : 1 }}
                  >
                    {busy ? <ActivityIndicator size="small" color="#3E8E66" /> : <Banknote size={16} color="#3E8E66" strokeWidth={2.4} />}
                    <Text variant="label" style={{ color: '#3E8E66', fontSize: 13.5 }}>Disburse</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
