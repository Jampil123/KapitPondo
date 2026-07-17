/**
 * services/api/src/lib/proofUrl.js
 * `proof_url` on contributions/expenses/loan_payments is a PATH inside the
 * private `proofs` bucket (see apps/mobile/src/lib/upload.ts) — same pattern
 * as id_document_url — so it must be exchanged for a short-lived signed URL
 * before any client can actually render it. Never throws: a signing failure
 * shouldn't break the list/detail response it's attached to.
 */
const supabase = require('../config/supabase');

const PROOF_BUCKET = 'proofs';
const SIGNED_URL_TTL = 300; // seconds

async function signProofUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (error) {
      console.error('[proofUrl] failed to sign', path, error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (e) {
    console.error('[proofUrl] failed to sign', path, e.message);
    return null;
  }
}

// Attaches `proof_signed_url` to a row (or array of rows) that has `proof_url`.
async function withSignedProof(rowOrRows) {
  if (Array.isArray(rowOrRows)) {
    return Promise.all(rowOrRows.map(async (row) => ({
      ...row,
      proof_signed_url: await signProofUrl(row.proof_url),
    })));
  }
  if (!rowOrRows) return rowOrRows;
  return { ...rowOrRows, proof_signed_url: await signProofUrl(rowOrRows.proof_url) };
}

module.exports = { signProofUrl, withSignedProof };
