// services/api/src/modules/distributions/distributions.routes.js
// KapitPondo — Distributions routes (M9, FINAL)
// Mount in app.js:  app.use('/api', require('./modules/distributions/distributions.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./distributions.service');

// Set a member's head count (owner only) — affects their distribution share
router.patch(
  '/groups/:groupId/memberships/:id/heads',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { heads } = req.body;
      if (heads == null || Number(heads) < 1) {
        return res.status(400).json({ error: 'heads must be 1 or greater' });
      }
      const membership = await service.setHeads({ membershipId: req.params.id, heads });
      res.json({ message: 'Heads updated', membership });
    } catch (err) { next(err); }
  }
);

// Preview a year-end distribution (owner or treasurer)
router.post(
  '/groups/:groupId/distributions/preview',
  requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const { period } = req.body;
      if (!period) {
        return res.status(400).json({ error: 'period is required (e.g. "2026")' });
      }
      const distribution = await service.previewDistribution({
        groupId: req.params.groupId,
        period,
        declaredBy: req.member.id,
      });
      const allocations = await service.getAllocations(distribution.id, { role: req.membership.role, membershipId: req.membership.id });
      res.status(201).json({ distribution, allocations });
    } catch (err) {
      if (err.message && err.message.includes('Nothing to distribute')) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  }
);

// List distributions (any member of the group)
router.get(
  '/groups/:groupId/distributions',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const distributions = await service.listDistributions(req.params.groupId);
      res.json({ distributions });
    } catch (err) { next(err); }
  }
);

// Get one distribution + its allocations
router.get(
  '/groups/:groupId/distributions/:id',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      const allocations = await service.getAllocations(distribution.id, { role: req.membership.role, membershipId: req.membership.id });
      res.json({ distribution, allocations });
    } catch (err) { next(err); }
  }
);

// Finalize a previewed distribution (owner only) — posts payouts, fund -> 0
router.post(
  '/groups/:groupId/distributions/:id/finalize',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      const finalized = await service.finalizeDistribution({
        distributionId: req.params.id,
        finalizedBy: req.member.id,
      });
      res.json({ message: 'Distribution finalized; fund balance is now 0', distribution: finalized });
    } catch (err) {
      if (err.message && err.message.includes('Fund changed since preview')) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Cancel a previewed distribution so it can be re-run (owner or treasurer)
router.delete(
  '/groups/:groupId/distributions/:id',
  requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      const cancelled = await service.cancelPreview(req.params.id);
      res.json({ message: 'Preview cancelled', distribution: cancelled });
    } catch (err) { next(err); }
  }
);

module.exports = router;