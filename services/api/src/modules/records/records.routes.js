const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const recordsService = require('./records.service');

// GET /me/records — a full personal record across every group the member
// belongs to (contributions, loans, repayments, penalties, ledger summary,
// year-end distribution), aggregated server-side for Profile's
// "Download my records". Read-only; nothing is written or cached.
router.get('/me/records', requireAuth, async (req, res, next) => {
  try {
    const record = await recordsService.buildMemberRecord(req.member);
    res.json(record);
  } catch (err) { next(err); }
});

module.exports = router;
