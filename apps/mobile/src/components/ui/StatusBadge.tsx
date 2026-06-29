/**
 * components/ui/StatusBadge.tsx
 * ----------------------------------------------------------------------------
 * One pill for every status in the app. Drive it by entity + raw enum value;
 * color + label come from theme/status.ts. This is why the UI stays consistent
 * across contributions, loans, memberships, cycles, distributions, expenses.
 *
 *   <StatusBadge entity="contribution" value={c.status} />
 *   <StatusBadge entity="loan" value={loan.status} />
 *   <StatusBadge entity="membership" value={m.status} />
 */
import { View } from 'react-native';
import { Text } from './Text';
import { intent } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { getStatusMeta, type StatusEntity } from '../../theme/status';

export type StatusBadgeProps = {
  entity: StatusEntity;
  value?: string | null;
  /** Override the auto label (e.g. show "Late" on a late contribution). */
  labelOverride?: string;
};

export function StatusBadge({ entity, value, labelOverride }: StatusBadgeProps) {
  const meta = getStatusMeta(entity, value);
  const tone = intent[meta.intent];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: tone.soft,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text variant="overline" style={{ color: tone.text }}>
        {labelOverride ?? meta.label}
      </Text>
    </View>
  );
}
