-- =====================================================================
-- KapitPondo — 0016 Storage buckets & policies
--
-- storage.objects lives outside public, so a reset may keep old policies;
-- each one is dropped before it is recreated.
-- =====================================================================

-- Existing buckets are left as they are.
insert into storage.buckets (id, name, public) values
  ('id-documents', 'id-documents', false),   -- KYC ID photos and selfies
  ('proofs',       'proofs',       false),   -- payment proofs (contributions, loan repayments)
  ('avatars',      'avatars',      true),    -- profile pictures
  ('chat-media',   'chat-media',   true)     -- images sent in group chat and direct messages
on conflict (id) do nothing;

drop policy if exists "authenticated can upload id documents" on storage.objects;
create policy "authenticated can upload id documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'id-documents');

drop policy if exists "authenticated can read own id documents" on storage.objects;
create policy "authenticated can read own id documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'id-documents');

drop policy if exists "authenticated can upload proofs" on storage.objects;
create policy "authenticated can upload proofs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs');

drop policy if exists "authenticated can read proofs" on storage.objects;
create policy "authenticated can read proofs"
  on storage.objects for select to authenticated
  using (bucket_id = 'proofs');

drop policy if exists "authenticated can upload avatars" on storage.objects;
create policy "authenticated can upload avatars"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "authenticated can update own avatars" on storage.objects;
create policy "authenticated can update own avatars"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "anyone can read avatars" on storage.objects;
create policy "anyone can read avatars"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists "authenticated can upload chat media" on storage.objects;
create policy "authenticated can upload chat media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media');

drop policy if exists "anyone can read chat media" on storage.objects;
create policy "anyone can read chat media"
  on storage.objects for select to public
  using (bucket_id = 'chat-media');
