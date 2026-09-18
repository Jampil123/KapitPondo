const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const supabase = require('../../config/supabase');

const CATEGORIES = ['payments', 'loans', 'group_announcements', 'direct_messages', 'account_security'];

// PATCH /me/notification-preferences  { payments?, loans?, group_announcements?, direct_messages?, account_security? }
// Merges into the existing JSON (req.member already carries the current
// value via requireAuth's own member select) rather than replacing it
// wholesale, so a client only ever needs to send the one toggle it changed.
router.patch('/me/notification-preferences', requireAuth, async (req, res, next) => {
  try {
    const patch = {};
    for (const key of CATEGORIES) {
      if (typeof req.body[key] === 'boolean') patch[key] = req.body[key];
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: `Body must include at least one of: ${CATEGORIES.join(', ')}` });
    }
    const merged = { ...(req.member.notification_preferences ?? {}), ...patch };
    const { data, error } = await supabase
      .from('members')
      .update({ notification_preferences: merged })
      .eq('id', req.member.id)
      .select('notification_preferences')
      .single();
    if (error) throw error;
    res.json({ notification_preferences: data.notification_preferences });
  } catch (err) { next(err); }
});

module.exports = router;
