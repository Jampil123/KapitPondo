import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

// react-native-web ships Alert.alert as a total no-op (`static alert() {}`), so every confirm/error dialog in the
// app — sign out, approve/reject actions, permission prompts — would silently do nothing in a browser. This falls
// back to the browser's own alert/confirm, which only supports a single OK or an OK/Cancel choice; a 3-button
// Alert.alert call (rare in this app) collapses to its first non-cancel button on web.
function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    NativeAlert.alert(title, message, buttons);
    return;
  }

  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  const text = [title, message].filter(Boolean).join('\n\n');

  if (list.length === 1) {
    window.alert(text);
    list[0].onPress?.();
    return;
  }

  const cancelBtn = list.find((b) => b.style === 'cancel');
  const actionBtn = list.find((b) => b !== cancelBtn) ?? list[0];
  if (window.confirm(text)) actionBtn.onPress?.();
  else cancelBtn?.onPress?.();
}

export const Alert = { alert };
