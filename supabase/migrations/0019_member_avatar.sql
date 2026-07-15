-- =====================================================================
-- KapitPondo — Migration 0019
-- Profile picture support: an avatar_url column on members, plus RLS
-- policies for the `avatars` bucket. Unlike id-documents/proofs (private,
-- see 0012), avatars are non-sensitive, so this bucket must be created as
-- PUBLIC (via the Supabase dashboard/admin API — bucket creation isn't
-- part of migrations here, same as the other buckets) so avatar_url can
-- store a plain public URL the app renders directly, no signed-URL
-- exchange needed.
-- =====================================================================

alter table members
  add column if not exists avatar_url text;

drop policy if exists "authenticated can upload avatars" on storage.objects;
create policy "authenticated can upload avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "authenticated can update own avatars" on storage.objects;
create policy "authenticated can update own avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "anyone can read avatars" on storage.objects;
create policy "anyone can read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- =====================================================================
-- End of 0019_member_avatar.sql
-- =====================================================================
