// services/api/src/modules/ledger/ledger.routes.js
// KapitPondo — Ledger corrections routes (M7, FINAL)
// Mount in app.js:  app.use('/api', require('./modules/ledger/ledger.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./ledger.service');

// Initiate a reversal request (Treasurer or Owner). Requires a reason. Does
// NOT touch the ledger yet — see /verify and /finalize below (TC-021).
router.post(
  '/groups/:groupId/ledger/:entryId/reverse',
  requireAuth,
  requireGroupRole(['treasurer', 'owner']),
  async (req, res, next) => {
    try {
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'reason is required to reverse an entry' });
      }
      const entry = await service.getEntry(req.params.entryId);
      if (entry.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Ledger entry does not belong to this group' });
      }
      const request = await service.initiateReversal({
        entryId: req.params.entryId,
        groupId: req.params.groupId,
        reason: reason.trim(),
        initiatedBy: req.member.id,
      });
      res.status(201).json({ message: 'Reversal requested — awaiting Auditor verification', request });
    } catch (err) {
      if (err.status === 409 || (err.message && err.message.includes('Cannot reverse'))) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  }
);

// List reversal requests (officers)
router.get(
  '/groups/:groupId/reversal-requests',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const requests = await service.listReversalRequests({ groupId: req.params.groupId, status: req.query.status });
      res.json({ requests });
    } catch (err) { next(err); }
  }
);

// Auditor verifies a pending reversal request (TC-026) — proceeds to the
// Owner for final approval.
router.post(
  '/groups/:groupId/reversal-requests/:id/verify',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const request = await service.verifyReversal({
        requestId: req.params.id,
        verifiedBy: req.member.id,
        notes: req.body?.notes,
      });
      if (!request) return res.status(409).json({ error: 'Request is not pending verification' });
      res.json({ message: 'Reversal verified — awaiting Owner approval', request });
    } catch (err) { next(err); }
  }
);

// Auditor rejects a reversal request (discrepancy found, etc.)
router.post(
  '/groups/:groupId/reversal-requests/:id/reject',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const request = await service.rejectReversal({
        requestId: req.params.id,
        verifiedBy: req.member.id,
        notes: req.body?.notes,
      });
      if (!request) return res.status(409).json({ error: 'Request is not pending verification' });
      res.json({ message: 'Reversal request rejected', request });
    } catch (err) { next(err); }
  }
);

// Owner finalizes a verified reversal — this is the only step that actually
// posts the reversing ledger entry.
router.post(
  '/groups/:groupId/reversal-requests/:id/finalize',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { request, reversalEntry } = await service.finalizeReversal({
        requestId: req.params.id,
        finalizedBy: req.member.id,
      });
      res.json({ message: 'Reversal finalized', request, reversalEntry });
    } catch (err) {
      if (err.status === 409) return res.status(409).json({ error: err.message });
      next(err);
    }
  }
);

// Post a manual adjustment (owner or treasurer). Requires a reason.
router.post(
  '/groups/:groupId/ledger/adjustment',
  requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const { membership_id, direction, amount, reason } = req.body;
      if (!['credit', 'debit'].includes(direction)) {
        return res.status(400).json({ error: 'direction must be "credit" or "debit"' });
      }
      if (amount == null || Number(amount) <= 0) {
        return res.status(400).json({ error: 'amount must be positive' });
      }
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'reason is required for an adjustment' });
      }
      const entry = await service.postAdjustment({
        groupId: req.params.groupId,
        membershipId: membership_id,
        direction,
        amount,
        reason: reason.trim(),
        postedBy: req.member.id,
      });
      res.json({ message: 'Adjustment posted', entry });
    } catch (err) { next(err); }
  }
);

module.exports = router;
