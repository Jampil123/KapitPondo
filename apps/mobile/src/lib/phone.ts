/**
 * lib/phone.ts
 * ----------------------------------------------------------------------------
 * Supabase Auth requires phone numbers in E.164 format (e.g. +639171234567).
 * Filipino users type numbers many ways (0917…, 917…, +63 917…), so normalize
 * before sending to signInWithPhone / verifyOtp.
 */

/** Convert common PH inputs to E.164. Returns null if it can't be parsed. */
export function toE164PH(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');

  if (digits.startsWith('+63') && digits.length === 13) return digits;          // +639XXXXXXXXX
  if (digits.startsWith('63') && digits.length === 12) return `+${digits}`;     // 639XXXXXXXXX
  if (digits.startsWith('09') && digits.length === 11) return `+63${digits.slice(1)}`; // 09XXXXXXXXX
  if (digits.startsWith('9') && digits.length === 10) return `+63${digits}`;    // 9XXXXXXXXX

  return null;
}

/**
 * Why a typed number can't be used, or undefined when it looks right. This
 * only checks the shape — length and a mobile prefix (9xx, or DITO's 895–898).
 * Whether the SIM is real and can receive texts is only known when the SMS is
 * sent; see isSmsSendError / SMS_SEND_FAILED for that case.
 */
export function phoneFormatError(raw: string): string | undefined {
  const e164 = toE164PH(raw);
  if (!e164) return 'Enter the full number — 10 digits after +63.';
  const local = e164.slice(3);
  if (!/^9\d{9}$/.test(local) && !/^89[5-8]\d{7}$/.test(local)) {
    return 'Mobile numbers start with 9, like +63 917 123 4567.';
  }
  return undefined;
}

/** Shown when the SMS provider (iProg, via the send-sms hook) refuses the number. */
export const SMS_SEND_FAILED = 'We couldn’t send a code to this number. Check that it’s correct and can receive texts.';

/** True when Supabase failed to send the SMS — the send-sms hook errored ("Unexpected status code returned from hook: 500") or the provider did. */
export function isSmsSendError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === 'sms_send_failed' || /hook|sms_send_failed|error sending (sms|confirmation)/i.test(e?.message ?? '');
}

/**
 * Pretty form for display: +63 917 123 4567. Accepts whatever shape the
 * number happens to be stored in (some rows are missing the leading "+"),
 * normalizing through toE164PH first so the 3-3-4 grouping still applies.
 */
export function formatPH(raw: string): string {
  const e164 = raw.startsWith('+') ? raw : toE164PH(raw);
  const m = e164?.match(/^\+63(\d{3})(\d{3})(\d{4})$/);
  return m ? `+63 ${m[1]} ${m[2]} ${m[3]}` : raw;
}