const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const supabase = require('../../config/supabase');

const CATEGORIES = ['bug', 'feature', 'general', 'other'];
const MAX_MESSAGE_LEN = 2000;

// POST /me/feedback  { category, message, app_version?, platform? }
// Write-only from the client's side — there is no feedback inbox in the
// mobile app, just a confirmation once this succeeds.
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

module.exports = router;
