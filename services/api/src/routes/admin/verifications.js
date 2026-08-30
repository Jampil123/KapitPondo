/**
 * services/api/src/routes/admin/verifications.js
 * ----------------------------------------------------------------------------
 * The core Sysadmin workflow: list the verification queue, view an applicant
 * (with short-lived SIGNED URLs for the private ID + selfie images), and
 * approve/reject. Every decision writes a system_audit_log row.
 *
 * Identity lives on `members` (supabase/migrations/0001_initial_schema.sql,
 * 0013_identity_fields.sql, 0032_verification_queue_health.sql) — this route
 * previously targeted a `profiles` table/columns that don't exist anywhere in
 * the schema (id_document_path, id_submitted_at, mobile_number, reject_reason),
 * so every request here 500'd. Fixed to the real table + column names, and the
 * response shapes now match what VerificationsPage.tsx actually reads
 * ({ members } from the list, { member: {...} } from the detail).
 */
const { Router } = require('express');
const { supabaseAdmin } = require('../../lib/supabaseAdmin');

const router = Router();
const ID_BUCKET = 'id-documents'; // private bucket — see apps/mobile/src/lib/upload.ts
const SIGNED_URL_TTL = 60; // seconds

async function writeAudit(actorId, action, targetId, metadata) {
  await supabaseAdmin.from('system_audit_log').insert({
    actor_id: actorId,
    action,
    target_type: 'account',
    target_id: targetId,
    metadata,
  });
}

async function signPath(path) {
  if (!path) return null;
  const { data: signed } = await supabaseAdmin.storage.from(ID_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return (signed && signed.signedUrl) || null;
}

// GET /admin/verifications?status=pending
router.get('/', async (req, res) => {
  const status = req.query.status || 'pending';
  let query = supabaseAdmin.from('members').select('*').order('submitted_at', { ascending: true, nullsFirst: false });
  if (status !== 'all') query = query.eq('verification_status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ members: data || [] });
});

// GET /admin/verifications/:id  → applicant + signed ID + selfie image URLs
router.get('/:id', async (req, res) => {
  const { data: row, error } = await supabaseAdmin
    .from('members')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!row) return res.status(404).json({ error: 'Not found' });

  const id_document_signed_url = await signPath(row.id_document_url);
  const selfie_signed_url = await signPath(row.selfie_url);
  if (id_document_signed_url || selfie_signed_url) {
    await writeAudit(req.admin.user_id, 'account.id_viewed', row.id, {
      id_document_url: row.id_document_url,
      selfie_url: row.selfie_url,
    });
  }

  res.json({
    member: { ...row, id_document_signed_url, selfie_signed_url },
    signed_url_ttl: SIGNED_URL_TTL,
  });
});

// POST /admin/verifications/:id/approve
router.post('/:id/approve', async (req, res) => {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('members')
    .update({ verification_status: 'verified', verified_by: req.admin.user_id, verified_at: now, verification_rejection_reason: null })
    .eq('id', req.params.id)
    .eq('verification_status', 'pending')
    .select('id, verification_status')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(409).json({ error: 'Account is not pending verification' });

  await writeAudit(req.admin.user_id, 'account.verified', req.params.id, { before: 'pending', after: 'verified' });
  res.json({ ok: true, account: data });
});

// POST /admin/verifications/:id/reject  { reason }
router.post('/:id/reject', async (req, res) => {
  const reason = req.body && req.body.reason ? String(req.body.reason).trim() : '';
  if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('members')
    .update({ verification_status: 'rejected', verified_by: req.admin.user_id, verified_at: now, verification_rejection_reason: reason })
    .eq('id', req.params.id)
    .eq('verification_status', 'pending')
    .select('id, verification_status')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(409).json({ error: 'Account is not pending verification' });

  await writeAudit(req.admin.user_id, 'account.rejected', req.params.id, { reason });
  res.json({ ok: true, account: data });
});

module.exports = router;
