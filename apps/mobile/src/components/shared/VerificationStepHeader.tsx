/**
 * components/shared/VerificationStepHeader.tsx
 * ----------------------------------------------------------------------------
 * The identity-verification flow's own header: back chevron + screen title +
 * "Step X of N", followed by a thin segmented progress bar — replaces the
 * generic brand-logo ScreenHeader + circular Stepper across the whole
 * verification flow (identity.tsx, identity-capture.tsx, selfie-capture.tsx)
 * so every screen in the flow reads as one continuous, numbered sequence.
 * Uses the app's own color tokens, not a separate palette.
 */
import { View, Pressable } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { semantic } from '../../theme/colors';

export function VerificationStepHeader({
  title, step, totalSteps, onBack,
}: {
  title: string;
  step: number;
  totalSteps: number;
  onBack: () => void;
}) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 }}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={18} color={semantic.textPrimary} />
        </Pressable>
        <View>
          <Text variant="label" style={{ fontSize: 15, fontWeight: '700' }}>{title}</Text>
          <Text variant="caption" color="secondary" style={{ marginTop: 1 }}>Step {step} of {totalSteps}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingBottom: 16 }}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: i < step ? semantic.brand : semantic.border }}
          />
        ))}
      </View>
    </View>
  );
}
