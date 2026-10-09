import { View } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import { Text } from './Text';
import { semantic, intent } from '../../theme/colors';

const RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'An uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'A lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'A number', test: (pw) => /\d/.test(pw) },
  { label: 'A special character', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

export function passwordMeetsRules(pw: string): boolean {
  return RULES.every((r) => r.test(pw));
}

export function PasswordRules({ password, visible = true }: { password: string; visible?: boolean }) {
  if (!visible) return null;
  return (
    <View style={{ gap: 2, marginTop: -8, marginBottom: 15 }}>
      {RULES.map((r) => {
        const met = r.test(password);
        const Icon = met ? CheckCircle2 : Circle;
        return (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 18 }}>
            <Icon size={13} color={met ? intent.success.base : semantic.textMuted} />
            <Text
              variant="caption"
              style={{ lineHeight: 16, includeFontPadding: false, color: met ? intent.success.text : semantic.textMuted }}
            >
              {r.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
