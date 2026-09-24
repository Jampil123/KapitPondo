import { View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';
import { ELIGIBILITY_CHECKS } from './eligibilityChecks';

/** Every loan eligibility check, passed or failed, from the eligibility API's `reasons`. */
export function EligibilityChecklist({ reasons }: { reasons: string[] }) {
  return (
    <View style={{ gap: 5, paddingHorizontal: 2 }}>
      {ELIGIBILITY_CHECKS.map((c) => {
        const pass = !reasons.includes(c.key);
        return (
          <View key={c.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
            {pass
              ? <Check size={13} color={intent.success.text} strokeWidth={2.6} style={{ marginTop: 2 }} />
              : <X size={13} color={intent.danger.text} strokeWidth={2.6} style={{ marginTop: 2 }} />}
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular', color: semantic.textSecondary }}>
              {pass ? c.passTitle : `${c.failTitle}. ${c.sub}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
