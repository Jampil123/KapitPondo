import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Browser: hand the text over as a normal file download (expo-file-system and the share sheet don't exist on the web). */
export function downloadInBrowser(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Writes `content` to a temp file named `filename` and opens the share sheet for it (a download on the web). */
export async function shareText(filename: string, content: string, mimeType = 'text/plain'): Promise<void> {
  if (Platform.OS === 'web') {
    downloadInBrowser(filename, content, mimeType);
    return;
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);

  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
