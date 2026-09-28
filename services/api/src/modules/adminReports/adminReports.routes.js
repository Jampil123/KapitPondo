/**
 * services/api/src/modules/adminReports/adminReports.routes.js
 * Reports & Analytics (System Administrator). Read-only by design: GET only,
 * no route here changes platform data.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireSystemAdmin = require('../../middleware/requireSystemAdmin');
const service = require('./adminReports.service');

// The report catalogue (categories, columns, supported filters).
router.get('/admin/reports', requireAuth, requireSystemAdmin, (req, res) => {
  res.json({ reports: service.listReports() });
});

// Dropdown contents for the filter bar.
router.get('/admin/reports/options', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    res.json({ options: await service.filterOptions() });
  } catch (err) { next(err); }
});

// Run one report. Unknown filters are ignored; unsupported ones simply don't
// apply, so the frontend can send the whole filter bar as-is.
router.get('/admin/reports/:key', requireAuth, requireSystemAdmin, async (req, res, next) => {
  try {
    const report = await service.runReport(req.params.key, {
      from: req.query.from || null,
      to: req.query.to || null,
      status: req.query.status || null,
      group_id: req.query.group_id || null,
      member_id: req.query.member_id || null,
      action: req.query.action || null,
    });
    if (!report) return res.status(404).json({ error: `Unknown report "${req.params.key}"` });
    res.json({ report });
  } catch (err) { next(err); }
});

module.exports = router;
