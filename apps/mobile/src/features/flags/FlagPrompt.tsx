/**
 * features/flags/FlagPrompt.tsx
 * ----------------------------------------------------------------------------
 * Bottom sheet for raising a flag: pick a reason (the flag's title), add an
 * optional note. Same sheet look as ReasonPrompt.
 */
import { useState } from 'react';
import { Modal, Pressable, View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { semantic, intent } from '@/theme/colors';

export const FLAG_REASONS = [
  "Amount doesn't match proof",
  'Duplicate entry',
  'Proof is unclear or missing',
  'Wrong member or date',
  'Broke a sign-off rule',
  'Something else',
] as const;

export function FlagPrompt({
  visible,
  title,
  defaultReason,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  /** Pre-selected reason, e.g. from a failed check. */
  defaultReason?: string;
  onConfirm: (reason: string, note: string) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const reason = picked ?? defaultReason ?? null;
  const needsNote = reason === 'Something else';
  const canSubmit = !!reason && (!needsNote || !!note.trim());

  function reset() {
    setPicked(null);
    setNote('');
  }

  function handleConfirm() {
    if (!reason) return;
    const trimmed = note.trim();
    // "Something else" has no headline of its own — the note becomes it.
    const headline = needsNote ? trimmed : reason;
    reset();
    onConfirm(headline, needsNote ? '' : trimmed);
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={handleCancel}>
          <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
            <Text variant="h3" style={{ fontSize: 17 }}>{title}</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FLAG_REASONS.map((r) => {
                const on = r === reason;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setPicked(r)}
                    style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: on ? intent.danger.base : semantic.border, backgroundColor: on ? intent.danger.soft : semantic.surface }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: on ? 'Poppins_600SemiBold' : 'Poppins_500Medium', color: on ? intent.danger.text : semantic.textSecondary }}>{r}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={needsNote ? "What's wrong?" : 'Details for the Organizer (optional)'}
              placeholderTextColor={semantic.textMuted}
              multiline
              textAlignVertical="top"
              style={{ backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 14, minHeight: 76, color: semantic.textPrimary, fontSize: 14 }}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" onPress={handleCancel} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Flag" onPress={handleConfirm} disabled={!canSubmit} style={{ backgroundColor: intent.danger.base }} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
