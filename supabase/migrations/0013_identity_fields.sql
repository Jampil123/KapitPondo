-- =====================================================================
-- KapitPondo — Migration 0013
-- Adds id_type and selfie_url to members, to support the 3-step identity
-- verification wizard (ID type + ID photo, selfie photo, review/email).
-- =====================================================================

alter table members
  add column if not exists id_type text,
  add column if not exists selfie_url text;

-- =====================================================================
-- End of 0013_identity_fields.sql
-- =====================================================================
