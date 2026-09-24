import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { dayOnly, type PeriodSummary } from './periodSummary';

/** Collected-of-expected card for one period. A past period reads "not paid" in red instead of "not yet paid". */
export function CollectionSummaryCard({ summary, periodWord, isPast }: { summary: PeriodSummary; periodWord: string; isPast: boolean }) {
  const notYetCount = summary.totalMembers - summary.collectedCount;
  return (
    <View style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 18, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <Text variant="overline" color="muted" style={{ paddingTop: 4 }}>{isPast ? 'Collected' : `Collected this ${periodWord}`}</Text>
        {notYetCount > 0 ? (
          <View style={{ backgroundColor: isPast ? intent.danger.soft : intent.warning.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20 }}>
            <Text style={{ fontSize: 10.5, fontFamily: 'Poppins_600SemiBold', color: isPast ? intent.danger.text : intent.warning.text }}>{notYetCount} {isPast ? 'not paid' : 'not yet paid'}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 20, fontFamily: 'Poppins_700Bold', color: semantic.textPrimary, letterSpacing: -0.4, marginTop: 4 }}>
        {formatPeso(summary.collected)} <Text style={{ fontSize: 13, color: semantic.textMuted, fontFamily: 'Poppins_500Medium' }}>of {formatPeso(summary.expected)}</Text>
      </Text>
      <Text variant="body" color="secondary" style={{ marginTop: 6, fontSize: 12.5 }}>
        {summary.collectedCount} of {summary.totalMembers} members posted{summary.dueDate ? ` · due ${dayOnly(summary.dueDate)}` : ''}
      </Text>
    </View>
  );
}
