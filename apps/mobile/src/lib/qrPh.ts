/**
 * lib/qrPh.ts
 * ----------------------------------------------------------------------------
 * This used to also build a fabricated EMVCo/"QR Ph" payload for the
 * treasurer's GCash QR — confirmed not to scan as a valid GCash payment
 * (the proprietary GUID/sub-tags GCash's scanner expects aren't publicly
 * documented, and a money-routing code is the wrong place to guess). The
 * "Pay with GCash" sheet now shows the Treasurer's own real GCash QR
 * screenshot instead (see group/settings.tsx's upload + PayGcashSheet.tsx's
 * display, both via the private `proofs` bucket). Only the reference-number
 * generator — which is entirely ours to define, not GCash's format — remains
 * here.
 */

/** A short, human-scannable reference for this contribution's payment, e.g. "KP-BRGY01-3F9A2B-202603". */
export function buildContributionReference({ fundCode, membershipId, when = new Date() }: { fundCode: string; membershipId: string; when?: Date }): string {
  const yyyymm = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}`;
  const shortId = membershipId.replace(/-/g, '').slice(-6).toUpperCase();
  return `KP-${fundCode.toUpperCase()}-${shortId}-${yyyymm}`;
}
