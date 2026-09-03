const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./distributions.service');
const { logAudit } = require('../../lib/auditLog');

// Set a member's OWN head count — self-service (member and officers alike),
// not an owner-configures-everyone action. Affects their own distribution
// share, so it's scoped to the caller's own membership row only.
router.patch(
  '/groups/:groupId/memberships/:id/heads',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      if (req.params.id !== req.membership.id) {
        return res.status(403).json({ error: 'You can only configure your own heads' });
      }
      const { heads } = req.body;
      if (heads == null || Number(heads) < 1) {
        return res.status(400).json({ error: 'heads must be 1 or greater' });
      }
      const { membership, previousHeads } = await service.setHeads({ membershipId: req.params.id, heads });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'heads_changed', entityType: 'membership_heads', entityId: req.params.id,
        before: { heads: previousHeads }, after: { heads },
      });
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

// Auditor verifies a previewed distribution (TC-027) — cross-checks against
// the ledger, proceeds to the Owner for finalization.
router.post(
  '/groups/:groupId/distributions/:id/verify',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      const verified = await service.verifyDistribution({
        distributionId: req.params.id,
        verifiedBy: req.member.id,
        notes: req.body?.notes,
      });
      if (!verified) return res.status(409).json({ error: 'Distribution is not in previewed status' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'verified', entityType: 'distribution', entityId: req.params.id,
        before: { status: 'previewed' }, after: { status: 'verified', period: distribution.period, total_amount: distribution.total_amount },
      });
      res.json({ message: 'Distribution verified — awaiting Owner finalization', distribution: verified });
    } catch (err) { next(err); }
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

// Finalize a VERIFIED distribution (owner only) — posts payouts, fund -> 0.
// Requires an Auditor to have verified it first (see /verify above).
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
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'finalized', entityType: 'distribution', entityId: req.params.id,
        before: { status: 'verified' }, after: { status: 'finalized', total_amount: distribution.total_amount },
      });
      res.json({ message: 'Distribution finalized; fund balance is now 0', distribution: finalized });
    } catch (err) {
      if (err.message && (err.message.includes('Fund changed since preview') || err.message.includes('not verified'))) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Cancel a previewed distribution so it can be re-run (owner or treasurer),
// or an Auditor flagging a discrepancy instead of verifying it (TC-027).
router.delete(
  '/groups/:groupId/distributions/:id',
  requireAuth,
  requireGroupRole(['owner', 'treasurer', 'auditor']),
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