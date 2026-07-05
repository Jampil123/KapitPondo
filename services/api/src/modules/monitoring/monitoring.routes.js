const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const service = require('./monitoring.service');

// All monitoring routes are System Administrator only.

// Confirms the caller is a system admin, and returns their identity for the
// admin console's sidebar. requireSystemAdmin 403s anyone who isn't.
router.get('/admin/me', requireAuth, requireSystemAdmin, async (req, res) => {
  res.json({ user_id: req.member.id, email: req.member.email });
});

// Platform overview — the headline dashboard numbers
router.get('/admin/monitoring/overview', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const overview = await service.platformOverview();
    res.json({ overview });
  } catch (err) { next(err); }
});

// Per-group health table
router.get('/admin/monitoring/groups', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const groups = await service.groupsOverview();
    res.json({ groups });
  } catch (err) { next(err); }
});

// System-wide audit feed
router.get('/admin/monitoring/audit', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const audit = await service.auditFeed({
      groupId: req.query.group_id,
      action: req.query.action,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    res.json({ audit });
  } catch (err) { next(err); }
});

// Recent platform-wide ledger activity
router.get('/admin/monitoring/activity', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const activity = await service.recentLedger({
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json({ activity });
  } catch (err) { next(err); }
});

module.exports = router;