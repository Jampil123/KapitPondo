/**
 * components/ui/ReasonPrompt.tsx
 * ----------------------------------------------------------------------------
 * Bottom-sheet prompt for actions that require a reason (rejecting a join
 * request, a contribution, an expense, a loan...). `Alert.prompt` is iOS-only
 * in React Native, so this is the cross-platform equivalent — same visual
 * language as the picker sheets already used in the identity wizard.
 *
 *   <ReasonPrompt
 *     visible={!!target} title="Reject request" confirmLabel="Reject" destructive
 *     onCancel={() => setTarget(null)}
 *     onConfirm={(reason) => { doReject(target, reason); setTarget(null); }}
 *   />
 */
import { useState } from 'react';
import { Modal, Pressable, View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { semantic, intent } from '../../theme/colors';

export function ReasonPrompt({
  visible,
  title,
  placeholder = 'Reason for the requester (optional)',
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  function handleConfirm() {
    const trimmed = reason.trim();
    setReason('');
    onConfirm(trimmed);
  }

  function handleCancel() {
    setReason('');
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.35)', justifyContent: 'flex-end' }} onPress={handleCancel}>
          <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 }}>
            <Text variant="h3" style={{ fontSize: 17 }}>{title}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={placeholder}
              placeholderTextColor={semantic.textMuted}
              multiline
              textAlignVertical="top"
              style={{
                backgroundColor: semantic.surfaceAlt, borderRadius: 12, padding: 14,
                minHeight: 88, color: semantic.textPrimary, fontSize: 14,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" onPress={handleCancel} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={confirmLabel}
                  onPress={handleConfirm}
                  style={destructive ? { backgroundColor: intent.danger.base } : undefined}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
