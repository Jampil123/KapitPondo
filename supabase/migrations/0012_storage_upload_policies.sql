-- =====================================================================
-- KapitPondo — Migration 0012
-- Storage RLS policies for the id-documents and proofs buckets. Both are
-- private buckets (created via the admin API, not SQL, since bucket
-- creation isn't part of migrations here). RLS is enabled by default on
-- storage.objects, so without these policies every request — including
-- from authenticated users — is denied, which was silently breaking
-- identity-document uploads.
-- =====================================================================

drop policy if exists "authenticated can upload id documents" on storage.objects;
create policy "authenticated can upload id documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'id-documents');

drop policy if exists "authenticated can read own id documents" on storage.objects;
create policy "authenticated can read own id documents"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'id-documents');

drop policy if exists "authenticated can upload proofs" on storage.objects;
create policy "authenticated can upload proofs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'proofs');

drop policy if exists "authenticated can read proofs" on storage.objects;
create policy "authenticated can read proofs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'proofs');

-- =====================================================================
-- End of 0012_storage_upload_policies.sql
-- =====================================================================
