-- =====================================================================
-- KapitPondo — Migration 0014
-- Adds first_name, middle_name, last_name, birthday to members, so the
-- identity wizard's "Enter your Information" step can persist the personal
-- details signup already collects into user_metadata but never saves here.
-- =====================================================================

alter table members
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists birthday text;

-- =====================================================================
-- End of 0014_member_personal_fields.sql
-- =====================================================================
