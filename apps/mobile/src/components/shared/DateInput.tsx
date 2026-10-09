/**
 * components/shared/DateInput.tsx
 * ----------------------------------------------------------------------------
 * Labelled date field that opens the native picker (inline sheet on iOS,
 * system dialog on Android, the browser's calendar on web). Values are local
 * ISO dates ("2026-09-26"). Used by Configure Cycle and the audit report's
 * custom period. DateField below is the form-styled variant (birthday fields).
 */
import { useState } from 'react';
import { View, Pressable, Modal, Platform } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { semantic, intent } from '../../theme/colors';
import { WebDateInput } from './WebDateInput';

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
        <WebDateInput value={value} onChange={onChange} min={minimumDate ? toIsoDate(minimumDate) : undefined} height={52} />
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

/** Form-styled date field (label above, like Field) — birthday on signup, identity and edit profile. */
export function DateField({ label, value, onChange, minimumDate, maximumDate, error, defaultDate }: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  error?: string;
  /** Where the picker opens when the field is empty. */
  defaultDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const current = parseIsoDate(value) ?? defaultDate ?? new Date();
  const errorText = error ? <Text variant="caption" style={{ color: intent.danger.text }}>{error}</Text> : null;

  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 7, marginBottom: 15 }}>
        <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
        <WebDateInput
          value={value}
          onChange={onChange}
          min={minimumDate ? toIsoDate(minimumDate) : undefined}
          max={maximumDate ? toIsoDate(maximumDate) : undefined}
          invalid={!!error}
        />
        {errorText}
      </View>
    );
  }

  return (
    <View style={{ gap: 6, marginBottom: 15 }}>
      <Text variant="label" color="secondary" style={{ fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
      <Pressable
        onPress={() => setShow(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          backgroundColor: semantic.surfaceAlt, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14,
          borderWidth: error ? 1.5 : 0, borderColor: error ? intent.danger.base : undefined,
        }}
      >
        <Text variant="body" style={{ color: value ? semantic.textPrimary : semantic.textMuted }}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
        <Calendar size={18} color={semantic.textMuted} />
      </Pressable>
      {errorText}

      {show && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          value={current}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onValueChange={(_e, date) => { onChange(toIsoDate(date)); setShow(false); }}
          onDismiss={() => setShow(false)}
          style={{ position: 'absolute', width: 0, height: 0 }}
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
                maximumDate={maximumDate}
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
