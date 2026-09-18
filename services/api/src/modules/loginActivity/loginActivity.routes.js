const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const supabase = require('../../config/supabase');

const MAX_LABEL_LEN = 200;

// POST /me/login-activity  { device_label?, platform?, app_version? }
// Self-reported by the client right after a session is established
// (AuthContext.tsx, after signInWithPassword/verifyOtp succeed) — the
// backend has no other way to see a login, since sign-in itself goes
// straight from the mobile client to Supabase Auth. Authenticated by the
// fresh session token, so a member can only ever record an entry for
// themselves. Best-effort: never meant to block sign-in on the client side,
// but still validated/errored normally here since the client already
// swallows failures from this call.
router.post('/me/login-activity', requireAuth, async (req, res, next) => {
  try {
    const { device_label, platform, app_version } = req.body;
    const { error } = await supabase.from('login_activity').insert({
      member_id: req.member.id,
      device_label: typeof device_label === 'string' ? device_label.slice(0, MAX_LABEL_LEN) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 50) : null,
      app_version: typeof app_version === 'string' ? app_version.slice(0, 50) : null,
    });
    if (error) throw error;
    res.status(201).json({ message: 'Recorded' });
  } catch (err) { next(err); }
});

// GET /me/login-activity — most recent 20 entries for the signed-in member.
router.get('/me/login-activity', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('login_activity')
      .select('id, device_label, platform, app_version, created_at')
      .eq('member_id', req.member.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ entries: data });
  } catch (err) { next(err); }
});

module.exports = router;
