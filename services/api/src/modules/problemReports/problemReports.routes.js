/**
 * services/api/src/modules/problemReports/problemReports.routes.js
 * Reports of Problems / Complaints — member filing + the System
 * Administrator's Review → Investigate → Resolve → Close workflow.
 *
 * Note what is absent by design: no route here touches contributions, loans,
 * or ledger entries. Financial corrections stay in the fund group's own
 * authorized workflow; an admin can only refer a report to the officers.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const service = require('./problemReports.service');

// --- member side ---
router.post('/me/problem-reports', requireAuth, async (req, res, next) => {
  try {
    const { category, subject, description, group_id } = req.body;
    const result = await service.fileReport({
      memberId: req.member.id, category, subject, description, groupId: group_id,
    });
    if (result.error) return res.status(result.unavailable ? 503 : 400).json({ error: result.error });
    res.status(201).json({ report: result.report });
  } catch (err) { next(err); }
});

router.get('/me/problem-reports', requireAuth, async (req, res, next) => {
  try {
    res.json({ reports: await service.listMyReports(req.member.id) });
  } catch (err) { next(err); }
});

// --- admin side ---
// Categories, statuses and allowed transitions — the console builds its
// workflow buttons from this rather than hardcoding them.
router.get('/admin/problem-reports/meta', requireAuth, requireSystemAdmin, async (req, res, next) => {
  let categories;
  try { categories = await service.getCategories(); } catch (err) { return next(err); }
  res.json({
    categories,
    statuses: service.STATUSES,
    resolutions: service.RESOLUTIONS,
    next_status: service.NEXT_STATUS,
  });
});

router.get('/admin/problem-reports', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const { status, category, group_id, member_id, from, to } = req.query;
    res.json(await service.listReports({ status, category, group_id, member_id, from, to }));
  } catch (err) { next(err); }
});

router.get('/admin/problem-reports/:id', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const report = await service.getReport(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ report });
  } catch (err) { next(err); }
});

// Advance a report: review, investigate, resolve (with a resolution), close.
router.post('/admin/problem-reports/:id/status', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const { status, note, resolution, resolution_note } = req.body;
    const result = await service.updateStatus({
      id: req.params.id,
      status,
      note,
      resolution,
      resolutionNote: resolution_note,
      adminMemberId: req.member.id,
    });
    if (result.error) return res.status(result.notFound ? 404 : 400).json({ error: result.error });
    res.json({ report: result.report });
  } catch (err) { next(err); }
});

module.exports = router;
