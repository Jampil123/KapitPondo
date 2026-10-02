import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';
import { formatPeso } from '@/lib/money';
import { whenLabel } from '@/features/auditlog/AuditTimeline';
import { ENTRY_LABEL } from './entryCopy';
import type { LedgerEntry } from '@/api/ledger';

/** Ledger entries on the same vertical rail as AuditTimeline: ring marker (green money in, red money out), time, what, who, and an amount chip. */
export function LedgerTimeline({ entries, subtitle, onOpen }: {
  entries: LedgerEntry[];
  subtitle: (e: LedgerEntry) => string | null;
  onOpen?: (e: LedgerEntry) => void;
}) {
  return (
    <>
      {entries.map((e, i) => {
        const credit = e.direction === 'credit';
        const tone = credit ? intent.success : intent.danger;
        const last = i === entries.length - 1;
        const sub = subtitle(e);
        return (
          <Pressable key={e.id} disabled={!onOpen} onPress={() => onOpen?.(e)} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 14, alignItems: 'center' }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: tone.base, backgroundColor: semantic.card, marginTop: 3 }} />
              {!last ? <View style={{ flex: 1, width: 1.5, backgroundColor: semantic.border, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: semantic.textMuted }}>{whenLabel(e.posted_at)}</Text>
              <Text style={{ fontSize: 14, lineHeight: 19, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 1 }}>
                {ENTRY_LABEL[e.entry_type] ?? e.description ?? e.entry_type.replace(/_/g, ' ')}
              </Text>
              {sub ? <Text style={{ fontSize: 11.5, color: semantic.textSecondary, marginTop: 1 }} numberOfLines={2}>{sub}</Text> : null}
              <View style={{ alignSelf: 'flex-start', backgroundColor: tone.soft, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9, marginTop: 7 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: tone.text }}>
                  {credit ? '+' : '-'}{formatPeso(e.amount)}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}
