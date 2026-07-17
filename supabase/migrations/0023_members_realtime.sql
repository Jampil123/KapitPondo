-- =====================================================================
-- KapitPondo — Migration 0023
-- The Notification Center updates live (migration 0022), but the member's
-- own `verification_status` shown on-screen (profile banner, create-group/
-- loan-request gates) was only ever loaded once at sign-in — an admin
-- approving/rejecting afterwards never reached an already-open app. RLS
-- already allows a member to read their own row (migration 0007); this
-- just adds `members` to the realtime publication so that row can stream.
-- Run this once — `alter publication ... add table` errors if repeated.
-- =====================================================================

alter publication supabase_realtime add table members;

-- =====================================================================
-- End of 0023_members_realtime.sql
-- =====================================================================
