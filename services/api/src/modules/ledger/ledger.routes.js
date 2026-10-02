// services/api/src/modules/ledger/ledger.routes.js
// KapitPondo — Ledger corrections routes (M7, FINAL)
// Mount in app.js:  app.use('/api', require('./modules/ledger/ledger.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./ledger.service');
const { logAudit } = require('../../lib/auditLog');

// One posting with the record behind it, what reversed it, and its audit
// trail — the officers' entry page. Officers only: it names who recorded and
// verified each record.
router.get(
  '/groups/:groupId/ledger/entries/:entryId',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const detail = await service.entryDetail({ groupId: req.params.groupId, entryId: req.params.entryId });
      if (!detail) return res.status(404).json({ error: 'Ledger entry not found' });
      res.json(detail);
    } catch (err) { next(err); }
  }
);

// Step 1 (UC-LG-01): the Treasurer starts a reversal, with a reason. Does NOT
// touch the ledger yet — see /verify and /finalize below.
router.post(
  '/groups/:groupId/ledger/:entryId/reverse',
  requireAuth,
  requireGroupRole(['treasurer']),
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
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'initiated', entityType: 'reversal_request', entityId: request.id,
        before: { entry_stands: true }, after: { entry_id: req.params.entryId, reason: reason.trim(), amount: entry.amount },
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
// Owner for final approval. Treasurer/Owner only get through when the entry
// is the Auditor's own (see reversalReviewBlock).
router.post(
  '/groups/:groupId/reversal-requests/:id/verify',
  requireAuth,
  requireGroupRole(['auditor', 'treasurer', 'owner']),
  async (req, res, next) => {
    try {
      const blocked = await service.reversalReviewBlock({
        requestId: req.params.id, groupId: req.params.groupId,
        memberId: req.member.id, membershipId: req.membership.id, role: req.membership.role,
      });
      if (blocked) return res.status(403).json({ error: blocked });
      const request = await service.verifyReversal({
        requestId: req.params.id,
        verifiedBy: req.member.id,
        notes: req.body?.notes,
      });
      if (!request) return res.status(409).json({ error: 'Request is not pending verification' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'verified', entityType: 'reversal_request', entityId: req.params.id,
        before: { status: 'pending_verification' }, after: { status: 'verified', notes: req.body?.notes ?? null },
      });
      res.json({ message: 'Reversal verified — awaiting Organizer approval', request });
    } catch (err) { next(err); }
  }
);

// Reject a reversal, with a reason — the Auditor while it's pending
// verification (step 2), or the Organizer once verified (step 3). Nothing is
// posted either way; the Treasurer is told why.
router.post(
  '/groups/:groupId/reversal-requests/:id/reject',
  requireAuth,
  requireGroupRole(['auditor', 'treasurer', 'owner']),
  async (req, res, next) => {
    try {
      const reason = (req.body?.reason ?? req.body?.notes ?? '').trim();
      if (!reason) return res.status(400).json({ error: 'reason is required to reject a reversal' });
      const current = await service.getReversalRequest(req.params.id);
      if (current.group_id !== req.params.groupId) return res.status(400).json({ error: 'Reversal request does not belong to this group' });

      let fromStatus;
      if (current.status === 'verified') {
        if (req.membership.role !== 'owner') return res.status(403).json({ error: 'Only the Organizer can reject a verified reversal' });
        if ([current.initiated_by, current.verified_by].includes(req.member.id)) {
          return res.status(403).json({ error: 'The person who started or verified a reversal cannot also decide it' });
        }
        fromStatus = 'verified';
      } else {
        const blocked = await service.reversalReviewBlock({
          requestId: req.params.id, groupId: req.params.groupId,
          memberId: req.member.id, membershipId: req.membership.id, role: req.membership.role,
        });
        if (blocked) return res.status(403).json({ error: blocked });
        fromStatus = 'pending_verification';
      }

      const request = await service.rejectReversal({ requestId: req.params.id, rejectedBy: req.member.id, reason, fromStatus });
      if (!request) return res.status(409).json({ error: 'This reversal is no longer waiting for a decision' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'rejected', entityType: 'reversal_request', entityId: req.params.id,
        before: { status: fromStatus }, after: { status: 'rejected', reason },
      });
      res.json({ message: 'Reversal rejected — the entry stands', request });
    } catch (err) { next(err); }
  }
);

// Step 3 (UC-LG-03): the Organizer approves a verified reversal — the only
// step that posts the reversing entry (approve_reversal, migration 0063).
router.post(
  '/groups/:groupId/reversal-requests/:id/finalize',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const current = await service.getReversalRequest(req.params.id);
      if (current.group_id !== req.params.groupId) return res.status(400).json({ error: 'Reversal request does not belong to this group' });
      const { request, reversalEntry } = await service.finalizeReversal({
        requestId: req.params.id,
        finalizedBy: req.member.id,
      });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'finalized', entityType: 'reversal_request', entityId: req.params.id,
        before: { status: 'verified' }, after: { status: 'finalized', reversal_entry_id: reversalEntry?.id ?? null },
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
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'posted', entityType: 'ledger_adjustment', entityId: entry.id,
        before: null, after: { direction, amount, reason: reason.trim(), membership_id },
      });
      res.json({ message: 'Adjustment posted', entry });
    } catch (err) { next(err); }
  }
);

module.exports = router;
