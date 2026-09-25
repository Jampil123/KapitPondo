import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';
import type { AuditFlag, FlagStatus } from '@/api/flags';

export const FLAG_STATUS: Record<FlagStatus, { label: string; soft: string; text: string }> = {
  open: { label: 'Under review', soft: intent.info.soft, text: intent.info.strong },
  resolved: { label: 'Resolved', soft: intent.success.soft, text: intent.success.text },
  dismissed: { label: 'Dismissed', soft: semantic.surfaceAlt, text: semantic.textSecondary },
};

/** Dot + label pill: "● Under review". */
export function FlagStatusPill({ status, prefix }: { status: FlagStatus; prefix?: string }) {
  const t = FLAG_STATUS[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, alignSelf: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.text }} />
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: t.text }}>{prefix ? `${t.label} ${prefix}` : t.label}</Text>
    </View>
  );
}

/** "Contribution from Ana Cruz". */
export function recordLabel(f: AuditFlag) {
  return f.record.name ? `${f.record.kind} from ${f.record.name}` : f.record.kind;
}

/** Where the flag stands, in one line: the Organizer's closing note, or the Auditor's detail while it's open. */
export function statusLine(f: AuditFlag) {
  if (f.status === 'open') return f.note ?? 'Waiting on the Organizer.';
  const who = f.resolver?.full_name ? ` by ${f.resolver.full_name}` : '';
  return f.resolution_note ?? (f.status === 'resolved' ? `Resolved${who}.` : `Dismissed${who}. The record was correct.`);
}
