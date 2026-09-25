-- =====================================================================
-- KapitPondo — Migration 0076
-- What the server read off each uploaded proof (Google Vision OCR, parsed
-- for amount / reference / date / sender), saved with the record so the
-- verifier can compare "Recorded" against "Read from proof" without trusting
-- anything the submitting phone reported. Written by the API only.
-- =====================================================================

alter table contributions
  add column if not exists proof_reading jsonb,
  add column if not exists proof_read_at timestamptz;

alter table loan_payments
  add column if not exists proof_reading jsonb,
  add column if not exists proof_read_at timestamptz;

-- =====================================================================
-- End of 0076_proof_reading.sql
-- =====================================================================
