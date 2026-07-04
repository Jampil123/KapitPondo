-- =====================================================================
-- KapitPondo — Migration 0015
-- Adds KYC-style fields to members for the identity wizard's dedicated
-- Personal Information step: nationality, a broken-down residential
-- address, source of funds, and employment/occupation.
-- =====================================================================

alter table members
  add column if not exists nationality text,
  add column if not exists region text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists barangay text,
  add column if not exists street_address text,
  add column if not exists zip_code text,
  add column if not exists source_of_funds text,
  add column if not exists employment_status text,
  add column if not exists occupation text;

-- =====================================================================
-- End of 0015_member_kyc_fields.sql
-- =====================================================================
