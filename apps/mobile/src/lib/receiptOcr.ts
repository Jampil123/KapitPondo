/**
 * lib/receiptOcr.ts
 * ----------------------------------------------------------------------------
 * Best-effort field extraction from a GCash/bank receipt's raw OCR text (see
 * api/ocr.ts) — plain regex pattern-matching against the text Vision
 * recognized, no AI interpretation involved. Every field is a draft the
 * member still reviews/edits before submitting; this never verifies a
 * payment, just saves typing when it gets it right. Being pure text
 * matching (not a model reading the receipt's actual layout), it's
 * inherently less reliable than an AI read — expect to miss on unusual
 * receipt formats, and never treat its output as more than a suggestion.
 */
import type { PaymentMethod } from '@/api/contributions';

export interface ParsedReceipt {
  amount: number | null;
  reference_number: string | null;
  /** The recipient number/account shown on the receipt (e.g. GCash's "Sent to"), if found. */
  recipient_number: string | null;
  payment_method: PaymentMethod | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

const PESO_RE = /(?:₱|php|p)\s?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/i;
const PH_MOBILE_RE = /\b(09\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/;

function findAmount(text: string): number | null {
  // Prefer a line that actually says "amount" — receipts print several peso
  // figures (amount, fee, total), and the labeled one is the reliable one.
  const lines = text.split('\n');
  const amountLine = lines.find((l) => /\bamount\b/i.test(l) && PESO_RE.test(l));
  if (amountLine) {
    const m = amountLine.match(PESO_RE);
    if (m) return Number(m[1].replace(/,/g, ''));
  }
  // Fall back to the largest peso figure anywhere — usually the total, not a fee.
  const all = [...text.matchAll(new RegExp(PESO_RE, 'gi'))].map((m) => Number(m[1].replace(/,/g, '')));
  return all.length ? Math.max(...all) : null;
}

function findReference(text: string): string | null {
  const labeled = text.match(/ref(?:erence)?\.?\s*(?:no\.?|number|#)?\s*[:\-]?\s*([0-9][0-9 \-]{7,20}[0-9])/i);
  if (labeled) return labeled[1].replace(/[\s-]/g, '');
  // No labeled reference found — fall back to the longest digit run on the
  // receipt (GCash reference numbers are typically its longest number).
  const digitRuns = [...text.matchAll(/\d[\d \-]{9,20}\d/g)].map((m) => m[0].replace(/[\s-]/g, ''));
  if (!digitRuns.length) return null;
  return digitRuns.reduce((longest, run) => (run.length > longest.length ? run : longest));
}

function findRecipientNumber(text: string): string | null {
  const lines = text.split('\n');
  const toLine = lines.find((l) => /\b(to|sent to|recipient|receiver)\b/i.test(l) && PH_MOBILE_RE.test(l));
  const match = (toLine ?? text).match(PH_MOBILE_RE);
  return match ? match[1].replace(/[\s-]/g, '') : null;
}

function findPaymentMethod(text: string): PaymentMethod | null {
  if (/gcash/i.test(text)) return 'gcash';
  return null;
}

export function parseReceiptText(text: string): ParsedReceipt {
  const amount = findAmount(text);
  const reference_number = findReference(text);
  const recipient_number = findRecipientNumber(text);
  const payment_method = findPaymentMethod(text);

  const matchCount = [amount, reference_number].filter((v) => v != null).length;
  const confidence: ParsedReceipt['confidence'] = matchCount === 2 ? 'high' : matchCount === 1 ? 'medium' : 'low';
  const notes = confidence === 'low'
    ? "Couldn't clearly find an amount or reference number on this photo — double-check the fields below."
    : null;

  return { amount, reference_number, recipient_number, payment_method, confidence, notes };
}
