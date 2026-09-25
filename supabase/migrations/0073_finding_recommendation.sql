-- =====================================================================
-- KapitPondo — Migration 0073
-- Audit findings get a recommendation: what the Auditor thinks the
-- Organizer or Treasurer should do next, kept apart from what was found.
-- =====================================================================

alter table audit_findings add column if not exists recommendation text;

-- =====================================================================
-- End of 0073_finding_recommendation.sql
-- =====================================================================
