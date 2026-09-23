import { useState } from 'react';
import { Alert } from '@/lib/alert';
import { readImageBase64 } from '@/lib/upload';
import { extractText } from '@/api/ocr';
import { parseReceiptText } from '@/lib/receiptOcr';
import { checkDuplicateExternalReference } from '@/api/lending';
import type { PaymentMethod } from '@/api/lending';

export interface ProofFlags {
  amountMismatch: boolean;
  recipientMismatch: boolean;
  duplicateRef: boolean;
}

interface UseLoanProofScanArgs {
  groupId: string | undefined;
  expectedAmount: number;
  treasurerGcashNumber?: string | null;
  /** Called with whatever OCR could read — the caller decides how to apply it. Unlike
   * contributions (fixed amount), loan repayment amount is editable, so callers
   * typically fill both `amount` and `reference` here. */
  onFields: (fields: { amount?: string; reference?: string; method?: PaymentMethod }) => void;
}

/**
 * Loan-repayment twin of contributions/useProofScan.ts — identical OCR
 * pipeline and mismatch math, with the duplicate-reference check pointed at
 * loan_payments (via checkDuplicateExternalReference) instead of
 * contributions, since that table lookup can't be shared across the two.
 */
export function useLoanProofScan({ groupId, expectedAmount, treasurerGcashNumber, onFields }: UseLoanProofScanArgs) {
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
        ? await checkDuplicateExternalReference(groupId, fields.reference_number).catch(() => false)
        : false;
      const recipientDigits = fields.recipient_number?.replace(/\D/g, '').slice(-10);
      const treasurerDigits = treasurerGcashNumber?.replace(/\D/g, '').slice(-10);
      setFlags({
        amountMismatch: fields.amount != null && Math.abs(fields.amount - expectedAmount) > 0.5,
        recipientMismatch: !!(recipientDigits && treasurerDigits && recipientDigits !== treasurerDigits),
        duplicateRef,
      });
    } catch {
      // Best-effort — a failed read never blocks the upload or submission.
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
 * Advisory duplicate-reference re-check right before submit, for a reference
 * typed by hand rather than read off a scanned receipt (scanProof above
 * already checked it once, hence `alreadyChecked`). Never blocks.
 */
export async function confirmLoanSubmitDespiteDuplicate(groupId: string, reference: string, alreadyChecked: boolean): Promise<boolean> {
  if (!reference.trim() || alreadyChecked) return true;
  const dup = await checkDuplicateExternalReference(groupId, reference.trim()).catch(() => false);
  if (!dup) return true;
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Reference already used',
      'This reference number is already attached to another repayment in this group. Submit anyway?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Submit anyway', style: 'destructive', onPress: () => resolve(true) },
      ],
    );
  });
}
