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

/** Pretty form for display: +63 917 123 4567 */
export function formatPH(e164: string): string {
  const m = e164.match(/^\+63(\d{3})(\d{3})(\d{4})$/);
  return m ? `+63 ${m[1]} ${m[2]} ${m[3]}` : e164;
}