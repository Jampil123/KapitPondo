-- =====================================================================
-- KapitPondo — Migration 0052
-- The identity wizard (apps/mobile/app/(app)/identity.tsx) now captures the
-- ID's back side too, not just the front. members.id_document_url stays the
-- front (unchanged meaning, unchanged callers); this adds the back as its
-- own nullable column so existing rows (front-only submissions) stay valid.
-- =====================================================================

alter table members add column if not exists id_document_back_url text;
