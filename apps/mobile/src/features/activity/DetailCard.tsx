/**
 * features/activity/DetailCard.tsx
 * ----------------------------------------------------------------------------
 * Building blocks for the slide-up detail pages (activity/[entryId],
 * owner-activity/[id]): a section title, plain label/value rows on the page,
 * and a small status pill under the summary.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { semantic } from '@/theme/colors';

export function DetailTitle({ title }: { title: string }) {
  return <Text variant="overline" color="muted" style={{ marginTop: 20, marginBottom: 9, marginLeft: 2 }}>{title}</Text>;
}

/** A titled card of label/value rows; rows with no value are left out, and the section disappears if none are left. */
export function DetailSection({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (shown.length === 0) return null;
  return (
    <>
      <DetailTitle title={title} />
      <View>
        {shown.map(([label, value], i) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: i < shown.length - 1 ? 1 : 0, borderColor: semantic.border }}>
            <Text variant="caption" color="secondary" style={{ width: 110 }}>{label}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {typeof value === 'string' || typeof value === 'number' ? (
                <Text style={{ textAlign: 'right', fontSize: 13, fontFamily: 'Poppins_500Medium', color: semantic.textPrimary }}>{value}</Text>
              ) : value}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

export function StatusPill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ marginTop: 10, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20, backgroundColor: bg }}>
      <Text style={{ fontSize: 11.5, fontFamily: 'Poppins_600SemiBold', color: fg }}>{label}</Text>
    </View>
  );
}
