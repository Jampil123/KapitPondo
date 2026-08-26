const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./contributions.service');
const { checkLatePenaltiesIfDue } = require('../penalties/penalties.service');

// Submit a contribution. Members record only their own (status 'submitted',
// awaiting officer approval) via the plain member self-submit flow (no
// membership_id in the body — that's how this tells the two flows apart).
// Officers using the "Record new" flow explicitly pass membership_id — for
// a walk-in member (TC-018) OR for their own membership — and either way it
// posts straight to the ledger (status 'approved') instead of going through
// the pending queue: the officer already physically confirmed the payment
// by recording it themselves, whoever it's for, so there's no separate
// claim left to verify the way there is for an unverified member self-report.
router.post('/groups/:groupId/contributions',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const { cycle_id, amount, payment_method, proof_url, external_reference, membership_id } = req.body;
      if (!cycle_id || amount == null) {
        return res.status(400).json({ error: 'cycle_id and amount are required' });
      }

      let targetMembershipId = req.membership.id;
      const isOfficer = ['treasurer', 'auditor', 'owner'].includes(req.membership.role);
      // membership_id is only ever sent by the officer's "Record new" UI
      // (the member's own contribute screen never sends it) — so its mere
      // presence means an officer explicitly recorded this, regardless of
      // whether the target happens to be their own membership.
      let isWalkIn = false;
      if (membership_id) {
        if (!isOfficer) {
          return res.status(403).json({ error: 'Only officers can record a contribution for another member' });
        }
        const target = await service.getActiveMembership(membership_id);
        if (!target || target.group_id !== req.params.groupId) {
          return res.status(400).json({ error: 'membership_id is not an active member of this group' });
        }
        targetMembershipId = membership_id;
        isWalkIn = true;
      }

      const contribution = isWalkIn
        ? await service.recordWalkInContribution({
            membershipId: targetMembershipId,
            cycleId: cycle_id,
            groupId: req.params.groupId,
            amount,
            paymentMethod: payment_method,
            externalReference: external_reference,
            officerId: req.member.id,
          })
        : await service.createContribution({
            membershipId: targetMembershipId,
            cycleId: cycle_id,
            groupId: req.params.groupId,
            amount,
            paymentMethod: payment_method,
            proofUrl: proof_url,
            externalReference: external_reference,
            recordedBy: req.member.id,
          });
      res.status(201).json({ contribution });
    } catch (err) { next(err); }
  }
);

// List contributions (members see own; officers see all)
router.get('/groups/:groupId/contributions',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      // Officers viewing the list is the trigger for lazy late-penalty
      // detection (no cron in this stack) — from their point of view this
      // just happens; nothing needs to be clicked (TC-039). Throttled
      // (checkLatePenaltiesIfDue, not the raw check) — this list is
      // realtime-watched by the same screen that calls it, so running it
      // on every single request would self-trigger a refetch of the page
      // an officer just opened whenever it writes a new 'late' row.
      if (req.membership.role !== 'member') {
        await checkLatePenaltiesIfDue(req.params.groupId).catch((e) => console.error('[penalties] check failed:', e.message));
      }
      const contributions = await service.listContributions({
        groupId: req.params.groupId,
        membershipId: req.membership.id,
        role: req.membership.role,
        status: req.query.status,
        cycleId: req.query.cycle_id,
      });
      res.json({ contributions });
    } catch (err) { next(err); }
  }
);

// Approve a contribution (officers only)
router.post('/groups/:groupId/contributions/:id/approve',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const contribution = await service.getContribution(req.params.id);
      if (contribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Contribution does not belong to this group' });
      }
      if (contribution.recorded_by === req.member.id) {
        return res.status(403).json({ error: 'You cannot approve a contribution you recorded' });
      }
      const ledgerEntry = await service.approveContribution({
        contributionId: req.params.id,
        approverId: req.member.id,
      });
      res.json({ message: 'Contribution approved', ledgerEntry });
    } catch (err) { next(err); }
  }
);

// Reject a contribution, with a reason the member can see (TC-025)
router.post('/groups/:groupId/contributions/:id/reject',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const contribution = await service.getContribution(req.params.id);
      if (contribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Contribution does not belong to this group' });
      }
      const updated = await service.rejectContribution({ contributionId: req.params.id, reason: req.body?.reason });
      res.json({ message: 'Contribution rejected', contribution: updated });
    } catch (err) { next(err); }
  }
);

module.exports = router;