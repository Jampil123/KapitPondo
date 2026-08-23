const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./contributions.service');
const { checkLatePenalties } = require('../penalties/penalties.service');

// Submit a contribution. Members record only their own (status 'submitted',
// awaiting officer approval). Officers may record on behalf of any active
// member of the group (e.g. cash/GCash paid outside the app) by passing
// membership_id — TC-018. A WALK-IN recording like that posts straight to
// the ledger (status 'approved') instead: the officer already physically
// confirmed the payment by receiving it, so there's no separate claim left
// to verify the way there is for a member's own self-submission.
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
      const isWalkIn = !!membership_id && membership_id !== req.membership.id;
      if (isWalkIn) {
        if (!isOfficer) {
          return res.status(403).json({ error: 'Only officers can record a contribution for another member' });
        }
        const target = await service.getActiveMembership(membership_id);
        if (!target || target.group_id !== req.params.groupId) {
          return res.status(400).json({ error: 'membership_id is not an active member of this group' });
        }
        targetMembershipId = membership_id;
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
      // just happens; nothing needs to be clicked (TC-039).
      if (req.membership.role !== 'member') {
        await checkLatePenalties(req.params.groupId).catch((e) => console.error('[penalties] check failed:', e.message));
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