-- =====================================================================
-- KapitPondo — Migration 0053
-- The back-of-ID capture (apps/mobile/app/(app)/identity-capture.tsx) now
-- live-scans the QR code on a PhilSys National ID's back and decodes its raw
-- payload for the reviewer. This is NOT a cryptographic authenticity check
-- (PSA's signing key/spec isn't available here) — it's just the decoded text
-- stored alongside the document so an admin can eyeball it during review.
-- =====================================================================

alter table members add column if not exists id_document_qr_data text;
