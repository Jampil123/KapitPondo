import { useState } from 'react';
import { Alert } from 'react-native';
import { readImageBase64 } from '@/lib/upload';
import { extractText } from '@/api/ocr';
import { parseReceiptText } from '@/lib/receiptOcr';
import { checkDuplicateReference } from '@/api/contributions';
import type { PaymentMethod } from '@/api/contributions';

export interface ProofFlags {
  amountMismatch: boolean;
  recipientMismatch: boolean;
  duplicateRef: boolean;
}

interface UseProofScanArgs {
  groupId: string | undefined;
  expectedAmount: number;
  treasurerGcashNumber?: string | null;
  /** Called with whatever OCR could read — the caller decides how to apply it (e.g. only fill blank fields). */
  onFields: (fields: { amount?: string; reference?: string; method?: PaymentMethod }) => void;
}

/**
 * Reads a just-picked receipt photo with plain OCR (Google Vision text
 * extraction, see api/ocr.ts) and pattern-matches the fields out of the raw
 * text itself (lib/receiptOcr.ts) — no AI interpretation involved. Computes
 * non-blocking validation flags the same way either way; a draft only, the
 * member still reviews every field before submitting. Shared by every screen
 * that lets a member attach a GCash receipt (the pay sheet and the plain
 * manual-entry form).
 */
export function useProofScan({ groupId, expectedAmount, treasurerGcashNumber, onFields }: UseProofScanArgs) {
  const [scanning, setScanning] = useState(false);
  const [flags, setFlags] = useState<ProofFlags | null>(null);
  const [scanMeta, setScanMeta] = useState<{ confidence: string; notes: string | null } | null>(null);

  async function scanProof(uri: string) {
    if (!groupId) return;
    setScanning(true);
    try {
      const { base64, mediaType } = await readImageBase64(uri);
      const ocr = await extractText(base64, mediaType);
      const fields = parseReceiptText(ocr.text);
      onFields({
        amount: fields.amount != null ? String(fields.amount) : undefined,
        reference: fields.reference_number ?? undefined,
        method: fields.payment_method ?? undefined,
      });
      setScanMeta({ confidence: fields.confidence, notes: fields.notes });

      const duplicateRef = fields.reference_number
        ? await checkDuplicateReference(groupId, fields.reference_number).catch(() => false)
        : false;
      const recipientDigits = fields.recipient_number?.replace(/\D/g, '').slice(-10);
      const treasurerDigits = treasurerGcashNumber?.replace(/\D/g, '').slice(-10);
      setFlags({
        amountMismatch: fields.amount != null && Math.abs(fields.amount - expectedAmount) > 0.5,
        recipientMismatch: !!(recipientDigits && treasurerDigits && recipientDigits !== treasurerDigits),
        duplicateRef,
      });
    } catch {
      // Best-effort — a failed read (unclear photo, OCR not configured,
      // network hiccup) just means the member fills the form by hand; it
      // never blocks the upload or the submission itself.
    } finally {
      setScanning(false);
    }
  }

  function reset() {
    setFlags(null);
    setScanMeta(null);
  }

  return { scanning, flags, scanMeta, scanProof, reset };
}

/**
 * Advisory duplicate-reference re-check right before submit, for the case a
 * reference was typed by hand rather than read off a scanned receipt
 * (scanProof above already checked it once, hence `alreadyChecked`). Never
 * blocks — the member can always choose to submit anyway.
 */
export async function confirmSubmitDespiteDuplicate(groupId: string, reference: string, alreadyChecked: boolean): Promise<boolean> {
  if (!reference.trim() || alreadyChecked) return true;
  const dup = await checkDuplicateReference(groupId, reference.trim()).catch(() => false);
  if (!dup) return true;
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Reference already used',
      'This reference number is already attached to another contribution in this group. Submit anyway?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Submit anyway', style: 'destructive', onPress: () => resolve(true) },
      ],
    );
  });
}
