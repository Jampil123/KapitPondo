-- =====================================================================
-- KapitPondo — 0018 Notification data
-- Extra context a notification needs to open the right screen when tapped
-- (e.g. { "sender_id": … } for a direct message → that conversation).
-- =====================================================================

alter table notifications add column if not exists data jsonb;
