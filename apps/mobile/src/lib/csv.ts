/**
 * lib/csv.ts
 * ----------------------------------------------------------------------------
 * Client-side CSV export — no backend involved, since the data being exported
 * (a member's own ledger rows) is already fetched into the screen. Writes to
 * the cache directory and hands it to the OS share sheet rather than trying
 * to "save" anywhere specific — that's the share target's job (Files, email,
 * Drive, WhatsApp, whatever the person picks).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

/** Writes `rows` as CSV to a temp file named `filename` and opens the share sheet for it. */
export async function shareCsv(filename: string, rows: (string | number)[][]): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(toCsv(rows));

  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: filename });
}
