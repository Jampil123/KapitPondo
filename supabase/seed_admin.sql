-- supabase/seed_admin.sql
-- Creates the static platform admin and links it into platform_admins.
-- Runs automatically on `supabase db reset` (see [db.seed] in config.toml),
-- or paste it into the SQL editor. Safe to re-run: an existing user just gets
-- its password reset and stays an admin.
--
--   email:    admin@kapitpondo.local
--   password: Admin1234        ← development only; change it for production
--
-- The members row is created by the on_auth_user_created trigger, then marked
-- verified. platform_admins is what grants admin access.

do $$
declare
  v_email    text := 'admin@kapitpondo.local';
  v_password text := 'Admin1234';
  v_user_id  uuid;
begin
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- GoTrue expects these as '' rather than null
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"full_name":"System Admin"}',
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id::text, 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into public.platform_admins (user_id, email, granted_at, active)
  values (v_user_id, v_email, now(), true)
  on conflict (user_id) do update set active = true;

  -- Admin access comes from platform_admins above; the admin's own member
  -- row is simply marked verified.
  update public.members
  set verification_status = 'verified',
      verified_at         = coalesce(verified_at, now())
  where auth_id = v_user_id;
end $$;
