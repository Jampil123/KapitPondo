-- =====================================================================
-- KapitPondo — Migration 0055
-- The structured GCash contribution flow needs a real, per-group number to
-- build a "QR Ph" payment QR against — there was nowhere to store it. Kept
-- on `groups` (not a separate table) since it's a single pair of fields the
-- Owner sets once, same shape as fund_code/description.
-- =====================================================================

alter table groups add column if not exists treasurer_gcash_number text;
alter table groups add column if not exists treasurer_gcash_name text;

-- =====================================================================
-- End of 0055_treasurer_gcash.sql
-- =====================================================================
