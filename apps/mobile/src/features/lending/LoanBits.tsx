import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic, intent, type IntentName } from '@/theme/colors';

/** Status pill with a small filled icon — "Active", "Eligible", "Locked"… */
export function Badge({ tone, label, Icon }: { tone: IntentName; label: string; Icon: any }) {
  const t = intent[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.soft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20 }}>
      <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: t.strong, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={9} color="#fff" strokeWidth={2.6} />
      </View>
      <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: t.text }}>{label}</Text>
    </View>
  );
}

/** One loan-eligibility check, passed (green tick) or failed (red "!"). */
export function ChecklistRow({ pass, title, sub, last }: { pass: boolean; title: string; sub: string; last?: boolean }) {
  const tone = pass ? intent.success : intent.danger;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderColor: semantic.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {pass ? <Check size={11} color={tone.text} strokeWidth={3} /> : <Text style={{ fontSize: 11, fontFamily: 'Poppins_700Bold', color: tone.text }}>!</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Poppins_700Bold', color: pass ? semantic.textPrimary : intent.danger.text }}>{title}</Text>
        <Text variant="caption" color="secondary" style={{ marginTop: 3, lineHeight: 16 }}>{sub}</Text>
      </View>
    </View>
  );
}
