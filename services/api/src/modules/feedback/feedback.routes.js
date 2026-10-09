const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const supabase = require('../../config/supabase');

const CATEGORIES = ['bug', 'feature', 'general', 'other'];
const MAX_MESSAGE_LEN = 2000;

// POST /me/feedback  { category, message, app_version?, platform? }
// Write-only from the member's side — the inbox is the admin console's
// Feedback page (GET /admin/feedback below).
router.post('/me/feedback', requireAuth, async (req, res, next) => {
  try {
    const { category, message, app_version, platform } = req.body;
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category must be one of: ' + CATEGORIES.join(', ') });
    }
    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (!trimmed) {
      return res.status(400).json({ error: 'message is required' });
    }
    const { error } = await supabase.from('feedback').insert({
      member_id: req.member.id,
      category,
      message: trimmed.slice(0, MAX_MESSAGE_LEN),
      app_version: typeof app_version === 'string' ? app_version.slice(0, 50) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 50) : null,
    });
    if (error) throw error;
    res.status(201).json({ message: 'Recorded' });
  } catch (err) { next(err); }
});

// Postgres "column does not exist" — migration 0069 (read_at) not applied yet.
const isMissingReadAt = (error) => error?.code === '42703' || /read_at/.test(error?.message ?? '');

// GET /admin/feedback/unread-count — sidebar badge.
router.get('/admin/feedback/unread-count', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const { count, error } = await supabase.from('feedback').select('id', { count: 'exact', head: true }).is('read_at', null);
    if (error) {
      if (isMissingReadAt(error)) return res.json({ unread: null });
      throw error;
    }
    res.json({ unread: count ?? 0 });
  } catch (err) { next(err); }
});

// POST /admin/feedback/:id/read — first open marks it read; later opens keep the original time.
router.post('/admin/feedback/:id/read', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('feedback').update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id).is('read_at', null);
    if (error && !isMissingReadAt(error)) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /admin/feedback?category=&from=&to=  — newest first, with the sender.
router.get('/admin/feedback', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const { category, from, to } = req.query;
    const run = (withRead) => {
      let q = supabase.from('feedback')
        .select(`id, category, message, app_version, platform, created_at, member_id,${withRead ? ' read_at,' : ''} member:member_id(full_name, email, phone, avatar_url)`)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (category && CATEGORIES.includes(category)) q = q.eq('category', category);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);
      return q;
    };
    let { data, error } = await run(true);
    // Without migration 0069 everything reads as already-read (no badge).
    if (error && isMissingReadAt(error)) ({ data, error } = await run(false));
    if (error) throw error;
    res.json({
      feedback: data.map(({ member, ...f }) => ({
        ...f,
        read_at: f.read_at === undefined ? f.created_at : f.read_at,
        member_name: member?.full_name ?? null,
        member_email: member?.email ?? null,
        member_phone: member?.phone ?? null,
        member_avatar_url: member?.avatar_url ?? null,
      })),
      categories: CATEGORIES,
    });
  } catch (err) { next(err); }
});

module.exports = router;
