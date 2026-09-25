/**
 * components/shared/DateInput.tsx
 * ----------------------------------------------------------------------------
 * Labelled date field that opens the native picker (inline sheet on iOS,
 * system dialog on Android, plain YYYY-MM-DD text on web). Values are local
 * ISO dates ("2026-09-26"). Used by Configure Cycle and the audit report's
 * custom period.
 */
import { useState } from 'react';
import { View, TextInput, Pressable, Modal, Platform } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { semantic } from '../../theme/colors';

function Label({ children }: { children: string }) {
  return <Text variant="overline" color="secondary" style={{ marginBottom: 8, marginLeft: 4 }}>{children}</Text>;
}
const inputStyle = { backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, height: 52, fontFamily: 'Poppins_400Regular', fontSize: 14, color: semantic.textPrimary };

export function parseIsoDate(value: string): Date | null {
  if (!value.trim()) return null;
  const d = new Date(`${value.trim()}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function formatDisplayDate(value: string): string {
  const d = parseIsoDate(value);
  return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : value;
}
export function DateInput({ label, value, onChange, minimumDate }: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const current = parseIsoDate(value) ?? new Date();

  if (Platform.OS === 'web') {
    return (
      <View>
        <Label>{label}</Label>
        <TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={semantic.textMuted} style={inputStyle} />
      </View>
    );
  }

  return (
    <View>
      <Label>{label}</Label>
      <Pressable
        onPress={() => setShow(true)}
        style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
      >
        <Text variant="body" style={{ fontSize: 14, color: value ? semantic.textPrimary : semantic.textMuted }}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
        <Calendar size={17} color={semantic.textMuted} />
      </Pressable>

      {show && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          value={current}
          minimumDate={minimumDate}
          onValueChange={(_e, date) => { onChange(toIsoDate(date)); setShow(false); }}
          onDismiss={() => setShow(false)}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={() => setShow(false)}>
            <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
              <Text variant="h3" style={{ fontSize: 17 }}>{label}</Text>
              <DateTimePicker
                mode="date"
                display="inline"
                value={current}
                minimumDate={minimumDate}
                onValueChange={(_e, date) => onChange(toIsoDate(date))}
              />
              <Button label="Done" onPress={() => setShow(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}
