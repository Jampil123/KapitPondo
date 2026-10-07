const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const service = require('./monitoring.service');
const fundGroups = require('./fundGroups.service');
const dashboardService = require('./dashboard.service');

// All monitoring routes are System Administrator only.

// Confirms the caller is a system admin, and returns their identity for the
// admin console's sidebar. requireSystemAdmin 403s anyone who isn't.
router.get('/admin/me', requireAuth, requireSystemAdmin, async (req, res) => {
  res.json({
    user_id: req.member.id,
    email: req.member.email ?? req.authUser.email,
    full_name: req.member.full_name,
    avatar_url: req.member.avatar_url,
  });
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

// Fund Group Monitoring — read-only (GET only; no approve/reject routes here)
router.get('/admin/monitoring/fund-groups', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const groups = await fundGroups.withSuspensionAndReports(await service.fundGroupsMonitoring());
    res.json({ groups });
  } catch (err) { next(err); }
});

// One fund group's read-only detail page.
router.get('/admin/monitoring/fund-groups/:groupId', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const rows = await fundGroups.withSuspensionAndReports(await service.fundGroupsMonitoring());
    const detail = await fundGroups.fundGroupDetail(req.params.groupId, rows.find((g) => g.group_id === req.params.groupId));
    if (!detail) return res.status(404).json({ error: 'Fund group not found' });
    res.json(detail);
  } catch (err) { next(err); }
});

// Suspend a fund group for a documented system-policy violation. The group
// becomes read-only for its members; its money and records are untouched.
router.post('/admin/fund-groups/:groupId/suspend', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) return res.status(400).json({ error: 'Document the policy violation before suspending a group.' });
    const group = await fundGroups.suspendGroup({
      groupId: req.params.groupId,
      adminMemberId: req.member.id,
      actorAuthId: req.authUser.id,
      reason,
    });
    if (!group) return res.status(409).json({ error: 'Group is already suspended, or not found' });
    res.json({ message: 'Fund group suspended', group });
  } catch (err) { next(err); }
});

router.post('/admin/fund-groups/:groupId/reinstate', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const group = await fundGroups.reinstateGroup({ groupId: req.params.groupId, actorAuthId: req.authUser.id });
    if (!group) return res.status(409).json({ error: 'Group is not suspended, or not found' });
    res.json({ message: 'Fund group reinstated', group });
  } catch (err) { next(err); }
});

// Fund Group Statistics for the dashboard — counts only, read-only
router.get('/admin/monitoring/fund-group-stats', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const stats = await service.fundGroupStats();
    res.json({ stats });
  } catch (err) { next(err); }
});

// System-wide (sysadmin) audit feed
router.get('/admin/monitoring/audit', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const audit = await service.auditFeed({
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

// Main admin dashboard — user / fund-group counts and recent system activity
// (no financial amounts; see dashboard.service.js).
router.get('/admin/monitoring/dashboard', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    res.json(await dashboardService.dashboard());
  } catch (err) { next(err); }
});

// Cross-entity search (members, groups, audit log) for the dashboard search bar
router.get('/admin/search', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ members: [], groups: [], audit: [] });
    const results = await service.search(q);
    res.json(results);
  } catch (err) { next(err); }
});

module.exports = router;