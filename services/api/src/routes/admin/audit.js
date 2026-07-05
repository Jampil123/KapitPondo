/**
 * services/api/src/routes/admin/audit.js — system audit log feed.
 */
const { Router } = require('express');
const { supabaseAdmin } = require('../../lib/supabaseAdmin');

const router = Router();

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { data, error } = await supabaseAdmin
    .from('system_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ entries: data || [] });
});

module.exports = router;