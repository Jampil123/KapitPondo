-- =====================================================================
-- KapitPondo — Migration 0058
-- Per-category notification preferences, read/written via
-- PATCH /api/me/notification-preferences and enforced at the single
-- choke point every notification already passes through (notify() in
-- services/api/src/lib/notifications.js) — so toggling a category off
-- here actually stops both the DB row and the push send, not just a
-- decorative switch.
-- =====================================================================

alter table members
  add column if not exists notification_preferences jsonb not null default
    '{"payments":true,"loans":true,"group_announcements":true,"direct_messages":true,"account_security":true}'::jsonb;

-- =====================================================================
-- End of 0058_notification_preferences.sql
-- =====================================================================
