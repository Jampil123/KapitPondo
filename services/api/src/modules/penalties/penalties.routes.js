const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./penalties.service');

// Manually run the late-contribution check for this group (officers) —
// always runs fresh (unthrottled), unlike the automatic trigger on viewing
// the contributions list (see contributions.routes.js's checkLatePenaltiesIfDue).
router.post('/groups/:groupId/penalties/check',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const created = await service.checkLatePenalties(req.params.groupId);
      res.json({ message: `${created.length} new penalty(ies) charged`, penalties: created });
    } catch (err) { next(err); }
  }
);

// List penalties (officers)
router.get('/groups/:groupId/penalties',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const penalties = await service.listPenalties({ groupId: req.params.groupId, status: req.query.status });
      res.json({ penalties });
    } catch (err) { next(err); }
  }
);

// Waive a pending penalty, with a reason (owner only) — TC-017
router.post('/groups/:groupId/penalties/:id/waive',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'reason is required to waive a penalty' });
      }
      const penalty = await service.waivePenalty({ penaltyId: req.params.id, waivedBy: req.member.id, reason: reason.trim() });
      if (!penalty) return res.status(409).json({ error: 'Penalty is not pending' });
      res.json({ message: 'Penalty waived', penalty });
    } catch (err) { next(err); }
  }
);

module.exports = router;
