/**
 * features/auditlog/AuditTimeline.tsx
 * ----------------------------------------------------------------------------
 * Audit entries on a vertical rail: ring marker coloured by who acted
 * (Treasurer orange, Auditor teal, Organizer purple), time, what happened,
 * who, and a from > to chip.
 * Used by the Auditor dashboard's Recent activity and a flag's Entry history.
 */
import { View, Pressable } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';
import { describe, ROLE_LABEL } from './describe';
import type { AuditLogEntry } from '@/api/auditLog';

/** "Today, 9:02 AM" / "Yesterday, 5:40 PM" / "Sep 24, 3:15 PM". */
export function whenLabel(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}, ${time}`;
}

// Organizer has no intent colour of its own — purple keeps the three officers apart at a glance.
const ORGANIZER = '#7C5CD6';
const ROLE_DOT: Record<string, string> = { treasurer: '#D9772B', auditor: intent.success.base, owner: ORGANIZER };

export function AuditTimeline({ entries, onOpen }: { entries: AuditLogEntry[]; onOpen?: (e: AuditLogEntry) => void }) {
  return (
    <>
      {entries.map((e, i) => {
        const d = describe(e);
        const dot = ROLE_DOT[e.actor_role ?? ''] ?? (d.toBad ? intent.danger.base : semantic.textMuted);
        const last = i === entries.length - 1;
        return (
          <Pressable key={e.id} disabled={!onOpen} onPress={() => onOpen?.(e)} style={{ flexDirection: 'row', gap: 12 }}>
            {/* Rail: ring marker + the line down to the next entry */}
            <View style={{ width: 14, alignItems: 'center' }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: dot, backgroundColor: semantic.card, marginTop: 3 }} />
              {!last ? <View style={{ flex: 1, width: 1.5, backgroundColor: semantic.border, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: semantic.textMuted }}>{whenLabel(e.created_at)}</Text>
              <Text style={{ fontSize: 14, lineHeight: 19, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary, marginTop: 1 }}>{d.title}</Text>
              <Text style={{ fontSize: 11.5, color: semantic.textSecondary, marginTop: 1 }} numberOfLines={1}>
                {e.actor?.full_name ?? 'Someone'}{e.actor_role ? `, ${ROLE_LABEL[e.actor_role] ?? e.actor_role}` : ''}
              </Text>
              {d.to ? (
                <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: semantic.surfaceAlt, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9, marginTop: 7 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Poppins_500Medium', color: semantic.textSecondary }}>{d.from ?? '—'}</Text>
                  <ChevronRight size={11} color={semantic.textSecondary} />
                  <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: semantic.textPrimary }}>{d.to}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}
