/**
 * components/ui/Stepper.tsx
 * ----------------------------------------------------------------------------
 * Numbered step indicator (1 — 2 — 3) with a connecting line. Each step is
 * completed / active / upcoming. Used by the identity-verification wizard;
 * replaces the old "Step 1 of 3" StatusBadge misuse.
 *
 *   <Stepper steps={['Submit an ID', 'Take a Selfie', 'Review & Submit']} current={1} />
 */
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from './Text';
import { semantic } from '../../theme/colors';

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4 }}>
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const completed = stepNum < current;
        const active = stepNum === current;
        const circleColor = completed || active ? semantic.brand : semantic.borderStrong;
        const textColor = completed || active ? semantic.textPrimary : semantic.textMuted;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <View style={{ flex: i === 0 ? 0 : 1, height: 2, backgroundColor: i === 0 ? 'transparent' : (completed ? semantic.brand : semantic.borderStrong) }} />
              <View
                style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: completed ? semantic.brand : semantic.background,
                  borderWidth: 2, borderColor: circleColor,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {completed ? (
                  <Check size={14} color="#fff" strokeWidth={3} />
                ) : (
                  <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: active ? semantic.brandDark : semantic.textMuted }}>
                    {stepNum}
                  </Text>
                )}
              </View>
              <View style={{ flex: i === steps.length - 1 ? 0 : 1, height: 2, backgroundColor: stepNum < current ? semantic.brand : semantic.borderStrong }} />
            </View>
            <Text variant="caption" style={{ marginTop: 6, textAlign: 'center', color: textColor, fontWeight: active ? '600' : '400' }} numberOfLines={2}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
