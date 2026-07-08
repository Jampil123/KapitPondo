/**
 * hooks/useSignedProofUrl.ts
 * ----------------------------------------------------------------------------
 * `proof_url` on contributions/loan_payments/expenses is a Supabase Storage
 * PATH (see lib/upload.ts), not a fetchable URL — there's no backend
 * signed-URL endpoint for the `proofs` bucket, but its RLS already lets any
 * authenticated user read it directly, so we mint a signed URL client-side.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SIGNED_URL_TTL = 3600; // seconds

export function useSignedProofUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from('proofs').createSignedUrl(path, SIGNED_URL_TTL).then(({ data, error }) => {
      if (!cancelled) setUrl(error ? null : data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);

  return url;
}
