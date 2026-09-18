/**
 * services/api/src/routes/admin/profileUpdateRequests.js
 * ----------------------------------------------------------------------------
 * Sysadmin review of member-submitted Information Update Requests (see
 * profileUpdateRequests.service.js). No mobile/web review UI exists yet —
 * these two endpoints are what makes the request → review → resolve loop
 * real and operable today, ahead of an admin screen being built.
 */
const { Router } = require('express');
const { supabaseAdmin } = require('../../lib/supabaseAdmin');
const service = require('../../modules/profileUpdateRequests/profileUpdateRequests.service');

const router = Router();

// GET /admin/profile-update-requests?status=pending
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    let query = supabaseAdmin.from('profile_update_requests').select('*, members!member_id(full_name, phone)').order('created_at', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ requests: data || [] });
  } catch (err) { next(err); }
});

// POST /admin/profile-update-requests/:id/approve
router.post('/:id/approve', async (req, res, next) => {
  try {
    const request = await service.approveRequest({ requestId: req.params.id, approverId: req.admin.user_id });
    res.json({ request });
  } catch (err) { next(err); }
});

// POST /admin/profile-update-requests/:id/reject  { reason }
router.post('/:id/reject', async (req, res, next) => {
  try {
    const reason = req.body && req.body.reason ? String(req.body.reason).trim() : '';
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });
    const request = await service.rejectRequest({ requestId: req.params.id, approverId: req.admin.user_id, reason });
    if (!request) return res.status(409).json({ error: 'Request is not pending' });
    res.json({ request });
  } catch (err) { next(err); }
});

module.exports = router;
