/**
 * services/api/src/routes/admin/verifications.js
 * ----------------------------------------------------------------------------
 * The core Sysadmin workflow: list the verification queue, view an applicant
 * (with a short-lived SIGNED URL for the private ID image), and approve/reject.
 * Every decision writes a system_audit_log row.
 *
 * ASSUMPTIONS (adjust to your real schema): identity lives on `profiles` with
 * `id` (= auth user id), `full_name`, `mobile_number`, `verification_status`,
 * a submitted-at timestamp, and an ID document path in the private
 * `id-documents` bucket. The path column name is auto-detected below.
 */
const { Router } = require('express');
const { supabaseAdmin } = require('../../lib/supabaseAdmin');

const router = Router();
const ID_BUCKET = 'id-documents';
const SIGNED_URL_TTL = 60; // seconds

function idDocPath(row) {
  return row.id_document_path || row.id_document_url || row.id_doc_path || row.id_document || null;
}

async function writeAudit(actorId, action, targetId, metadata) {
  await supabaseAdmin.from('system_audit_log').insert({
    actor_id: actorId,
    action,
    target_type: 'account',
    target_id: targetId,
    metadata,
  });
}

// GET /admin/verifications?status=pending
router.get('/', async (req, res) => {
  const status = req.query.status || 'pending';
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('verification_status', status)
    .order('id_submitted_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ verifications: data || [] });
});

// GET /admin/verifications/:id  → applicant + signed ID image URL
router.get('/:id', async (req, res) => {
  const { data: row, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!row) return res.status(404).json({ error: 'Not found' });

  let id_document_signed_url = null;
  const path = idDocPath(row);
  if (path) {
    const { data: signed } = await supabaseAdmin.storage.from(ID_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    id_document_signed_url = (signed && signed.signedUrl) || null;
    await writeAudit(req.admin.user_id, 'account.id_viewed', row.id, { path });
  }

  res.json({ applicant: row, id_document_signed_url, signed_url_ttl: SIGNED_URL_TTL });
});

// POST /admin/verifications/:id/approve
router.post('/:id/approve', async (req, res) => {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ verification_status: 'verified', verified_by: req.admin.user_id, verified_at: now, reject_reason: null })
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
    .from('profiles')
    .update({ verification_status: 'rejected', verified_by: req.admin.user_id, verified_at: now, reject_reason: reason })
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