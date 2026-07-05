/**
 * services/api/src/routes/admin/metrics.js — platform monitoring.
 * Aggregate COUNTS only (never per-group financial detail).
 */
const { Router } = require('express');
const { supabaseAdmin } = require('../../lib/supabaseAdmin');

const router = Router();

router.get('/', async (_req, res) => {
  const q = supabaseAdmin;
  const head = { count: 'exact', head: true };
  const [pending, verified, total, groups, cycles] = await Promise.all([
    q.from('profiles').select('*', head).eq('verification_status', 'pending'),
    q.from('profiles').select('*', head).eq('verification_status', 'verified'),
    q.from('profiles').select('*', head),
    q.from('groups').select('*', head),
    q.from('cycles').select('*', head).eq('status', 'active'),
  ]);
  res.json({
    pending_verifications: pending.count || 0,
    verified_users: verified.count || 0,
    total_users: total.count || 0,
    total_groups: groups.count || 0,
    active_cycles: cycles.count || 0,
  });
});

module.exports = router;