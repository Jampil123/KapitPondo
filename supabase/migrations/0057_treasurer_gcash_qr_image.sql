-- =====================================================================
-- KapitPondo — Migration 0057
-- The QR this app was generating for the "Pay with GCash" sheet was a
-- best-effort EMVCo/QR-Ph payload with a guessed proprietary GCash field —
-- confirmed to NOT scan as a valid GCash payment. Rather than keep guessing
-- at an undocumented proprietary format (a money-routing code is the wrong
-- place to guess), the Treasurer now uploads their own real GCash "Receive
-- Money" QR (a screenshot from their own GCash app) once, and members see
-- that real, GCash-issued image instead of a fabricated one.
--
-- Stored as a Storage PATH in the existing private `proofs` bucket (same
-- pattern as contributions.proof_url — see lib/upload.ts / useSignedProofUrl
-- on the mobile side), not a public URL.
-- =====================================================================

alter table groups add column if not exists treasurer_gcash_qr_url text;
alter table groups add column if not exists treasurer_gcash_pending_qr_url text;

-- =====================================================================
-- End of 0057_treasurer_gcash_qr_image.sql
-- =====================================================================
