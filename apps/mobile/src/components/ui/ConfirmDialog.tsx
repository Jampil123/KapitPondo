import type { ComponentType } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Button } from './Button';
import { semantic, intent } from '../../theme/colors';

// Bottom-sheet confirm dialog: a styled alternative to Alert.alert, which renders as a plain browser confirm on web.
export function ConfirmDialog({
  visible,
  title,
  message,
  icon: Icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tone = destructive ? intent.danger : intent.primary;
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(20,24,26,0.45)', justifyContent: 'flex-end' }}
        onPress={loading ? undefined : onCancel}
      >
        <Pressable style={{ backgroundColor: semantic.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 22 + insets.bottom, alignItems: 'center', gap: 10 }}>
          {Icon ? (
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tone.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Icon size={24} color={tone.text} />
            </View>
          ) : null}
          <Text variant="h3" style={{ fontSize: 17, textAlign: 'center' }}>{title}</Text>
          {message ? <Text color="secondary" style={{ fontSize: 13.5, textAlign: 'center' }}>{message}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, alignSelf: 'stretch' }}>
            <View style={{ flex: 1 }}>
              <Button label={cancelLabel} variant="ghost" onPress={onCancel} disabled={loading} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={confirmLabel}
                onPress={onConfirm}
                loading={loading}
                style={destructive ? { backgroundColor: intent.danger.base } : undefined}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
