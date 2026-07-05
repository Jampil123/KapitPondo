-- supabase/seed_admin.sql
-- Links the STATIC admin (a normal Supabase auth user you created once) into
-- platform_admins. Run this AFTER the auth user exists.
--
-- Two ways to create that auth user:
--   (1) Dashboard → Authentication → Users → Add user (set email + password,
--       and mark the email as confirmed), then run this file.
--   (2) The reproducible script: services/api/scripts/seed-admin.ts (uses the
--       service role to create the user AND link it in one step).
--
-- Change the email below to your chosen static admin address.

insert into public.platform_admins (user_id, email, granted_at, active)
select id, email, now(), true
from auth.users
where email = 'admin@kapitpondo.local'   -- ← your static admin email
on conflict (user_id) do update set active = true;