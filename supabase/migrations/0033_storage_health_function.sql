-- ── storage_health ───────────────────────────────────────────────────
-- Real data for the admin "Storage Health" page: bytes stored per bucket,
-- orphaned-file counts (uploaded but never linked to a members/contributions/
-- loan_payments/expenses row), proof-type upload volumes, and a sample
-- object the API layer can time a real signed-URL creation against (for
-- retrieval latency). security definer so it can read storage.objects
-- (RLS-restricted, private buckets) regardless of who calls it.
--
-- Only 3 buckets exist in this project: id-documents, proofs (shared by
-- contributions/loan_payments/expenses — there's no per-category bucket),
-- and avatars. `loans` (applications) has no proof column — only
-- `loan_payments` (repayments) does, so "Loan Reference" volume below
-- reflects loan-payment proofs, the closest real analog.
drop function if exists storage_health();
create or replace function storage_health()
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_bytes', (
      select coalesce(sum((metadata->>'size')::bigint), 0)
      from storage.objects
      where bucket_id in ('id-documents', 'proofs', 'avatars')
    ),
    'bucket_bytes', (
      select coalesce(jsonb_object_agg(bucket_id, bytes), '{}'::jsonb)
      from (
        select bucket_id, coalesce(sum((metadata->>'size')::bigint), 0) as bytes
        from storage.objects
        where bucket_id in ('id-documents', 'proofs', 'avatars')
        group by bucket_id
      ) b
    ),
    'orphaned_proofs', (
      select count(*) from storage.objects o
      where o.bucket_id = 'proofs'
        and o.name not in (
          select proof_url from contributions where proof_url is not null
          union select proof_url from loan_payments where proof_url is not null
          union select proof_url from expenses where proof_url is not null
        )
    ),
    'orphaned_id_documents', (
      select count(*) from storage.objects o
      where o.bucket_id = 'id-documents'
        and o.name not in (
          select id_document_url from members where id_document_url is not null
          union select selfie_url from members where selfie_url is not null
        )
    ),
    'orphaned_avatars', (
      select count(*) from storage.objects o
      where o.bucket_id = 'avatars'
        and o.name not in (
          select avatar_url from members where avatar_url is not null
        )
    ),
    'category_volume', jsonb_build_object(
      'idVerification', (select count(*) from members where id_document_url is not null),
      'contributionProof', (select count(*) from contributions where proof_url is not null),
      'loanReference', (select count(*) from loan_payments where proof_url is not null),
      'expenseReceipt', (select count(*) from expenses where proof_url is not null)
    ),
    'sample_object', (
      select jsonb_build_object('bucket_id', bucket_id, 'name', name)
      from storage.objects
      where bucket_id in ('id-documents', 'proofs', 'avatars')
      order by created_at desc
      limit 1
    )
  ) into result;
  return result;
end;
$$;
