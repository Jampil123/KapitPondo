import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes `content` to a temp file named `filename` and opens the share sheet for it. */
export async function shareText(filename: string, content: string, mimeType = 'text/plain'): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);

  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
