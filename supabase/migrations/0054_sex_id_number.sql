-- =====================================================================
-- KapitPondo — Migration 0054
-- The identity wizard's step 3 (Personal Information) now also asks for
-- sex and the ID number printed on the document, matching what's actually
-- on the ID.
-- =====================================================================

alter table members add column if not exists sex text;
alter table members add column if not exists id_number text;
