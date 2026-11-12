const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./distributions.service');
const { logAudit } = require('../../lib/auditLog');
const officers = require('../../lib/officers');
const { notify } = require('../../lib/notifications');

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
      const { membership, previousHeads } = await service.setHeads({ groupId: req.params.groupId, membershipId: req.params.id, heads });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'heads_changed', entityType: 'membership_heads', entityId: req.params.id,
        before: { heads: previousHeads }, after: { heads },
      });
      res.json({ message: 'Heads updated', membership });
    } catch (err) { next(err); }
  }
);

// Read a membership's head names — anyone in the group (same visibility as
// the member directory, which already lists heads).
router.get(
  '/groups/:groupId/memberships/:id/head-names',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const names = await service.getHeadNames({ groupId: req.params.groupId, membershipId: req.params.id });
      res.json({ names });
    } catch (err) { next(err); }
  }
);

// Name the extra heads a member carries (heads 2..n) — self-service, own
// membership only. Body: { names: { "2": "Pedro", "3": "" } }; a blank name
// clears it back to plain "Head 3".
router.put(
  '/groups/:groupId/memberships/:id/head-names',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      if (req.params.id !== req.membership.id) {
        return res.status(403).json({ error: 'You can only name your own heads' });
      }
      const { names } = req.body ?? {};
      if (!names || typeof names !== 'object' || Array.isArray(names)) {
        return res.status(400).json({ error: 'names must be an object of head number to name' });
      }
      const saved = await service.setHeadNames({ membershipId: req.params.id, names });
      res.json({ names: saved });
    } catch (err) { next(err); }
  }
);

// Live estimate of the split before anything is prepared (nothing saved). Officers.
router.get(
  '/groups/:groupId/distributions/estimate',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      res.json(await service.estimate(req.params.groupId));
    } catch (err) { next(err); }
  }
);

// UC-YD-01 E1/E2/A3: what stops the Treasurer from preparing the preview right now.
router.get(
  '/groups/:groupId/distributions/readiness',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      res.json({ blockers: await service.previewReadiness(req.params.groupId) });
    } catch (err) { next(err); }
  }
);

// Step 1 of the year-end split: the Treasurer prepares a draft for the active
// cycle. The Auditor verifies it and the Organizer finalizes, so no one does two steps.
router.post(
  '/groups/:groupId/distributions/preview',
  requireAuth,
  requireGroupRole(['treasurer']),
  async (req, res, next) => {
    try {
      const distribution = await service.previewDistribution({
        groupId: req.params.groupId,
        declaredBy: req.member.id,
      });
      const allocations = await service.getAllocations(distribution.id, { role: req.membership.role, membershipId: req.membership.id });
      res.status(201).json({ distribution, allocations });
    } catch (err) { next(err); }
  }
);

// UC-YD-01 step 5: the Treasurer submits the draft; the Auditor is notified.
router.post(
  '/groups/:groupId/distributions/:id/submit',
  requireAuth,
  requireGroupRole(['treasurer']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      const submitted = await service.submitDistribution({ distributionId: req.params.id, actorId: req.member.id });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'submitted', entityType: 'distribution', entityId: req.params.id,
        before: { status: 'draft' }, after: { status: 'previewed', period: submitted.period, total_amount: submitted.total_amount },
      });
      await officers.notifyRole({
        groupId: req.params.groupId, role: 'auditor', skip: [req.member.id],
        type: 'distribution.submitted', title: 'Year-end distribution to verify',
        message: `The Treasurer submitted the ${submitted.period} distribution for your verification.`,
      });
      res.json({ distribution: submitted });
    } catch (err) { next(err); }
  }
);

// UC-YD-02 steps 2-3, E1: the preview's figures next to what the ledger says now.
router.get(
  '/groups/:groupId/distributions/:id/ledger-check',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      res.json(await service.ledgerCheck(req.params.id));
    } catch (err) { next(err); }
  }
);

// Auditor verifies a previewed distribution (UC-YD-02 step 4) — only while its
// figures still match the ledger (E1); the Organizer is notified to finalize.
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
      if (distribution.status !== 'previewed') {
        return res.status(409).json({ error: 'Distribution is not in previewed status' });
      }
      const check = await service.ledgerCheck(req.params.id);
      if (!check.matches) {
        return res.status(409).json({ error: "The figures don't match the ledger anymore. Return it to the Treasurer to prepare again." });
      }
      const notes = (req.body?.notes ?? '').trim() || null;
      const verified = await service.verifyDistribution({
        distributionId: req.params.id,
        verifiedBy: req.member.id,
        notes,
      });
      if (!verified) return res.status(409).json({ error: 'Distribution is not in previewed status' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'verified', entityType: 'distribution', entityId: req.params.id,
        before: { status: 'previewed' }, after: { status: 'verified', period: distribution.period, total_amount: distribution.total_amount, notes },
      });
      await officers.notifyRole({
        groupId: req.params.groupId, role: 'owner', skip: [req.member.id],
        type: 'distribution.verified', title: 'Year-end distribution verified',
        message: `The Auditor verified the ${distribution.period} distribution. Review it and finalize.`,
      });
      res.json({ message: 'Distribution verified — awaiting Organizer finalization', distribution: verified });
    } catch (err) { next(err); }
  }
);

// Auditor undoes their verification while it still waits for the Organizer to finalize.
router.post(
  '/groups/:groupId/distributions/:id/unverify',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      if (distribution.verified_by !== req.member.id) {
        return res.status(403).json({ error: 'Only the Auditor who verified this distribution can undo it' });
      }
      const reopened = await service.unverifyDistribution({ distributionId: req.params.id, memberId: req.member.id });
      if (!reopened) return res.status(409).json({ error: 'This distribution is no longer waiting to be finalized' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'unverified', entityType: 'distribution', entityId: req.params.id,
        before: { status: 'verified' }, after: { status: 'previewed', period: distribution.period, total_amount: distribution.total_amount },
      });
      res.json({ message: 'Verification undone — the preview is back for review', distribution: reopened });
    } catch (err) { next(err); }
  }
);

// Auditor returns the preview to the Treasurer with a reason — before verifying it, or after verifying it themselves
// as long as the Organizer hasn't finalized. The preview is removed; the Treasurer rebuilds it.
router.post(
  '/groups/:groupId/distributions/:id/return',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const reason = (req.body?.reason ?? '').trim();
      if (!reason) return res.status(400).json({ error: 'reason is required to return a distribution' });
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      if (distribution.status === 'verified' && distribution.verified_by !== req.member.id) {
        return res.status(403).json({ error: 'Only the Auditor who verified this distribution can return it' });
      }
      const returned = await service.returnDistribution({ distributionId: req.params.id, memberId: req.member.id, reason });
      if (!returned) return res.status(409).json({ error: 'This distribution can no longer be returned' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'returned', entityType: 'distribution', entityId: req.params.id,
        before: { status: distribution.status }, after: { status: 'returned', reason, period: distribution.period, total_amount: distribution.total_amount },
      });
      await officers.notifyRole({
        groupId: req.params.groupId, role: 'treasurer', skip: [req.member.id],
        type: 'distribution.returned', title: 'Year-end distribution returned',
        message: `The Auditor returned the ${distribution.period} preview. Reason: ${reason}`,
      });
      res.json({ message: 'Returned to the Treasurer' });
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
      const distributions = await service.listDistributions(req.params.groupId, { includeDrafts: req.membership.role === 'treasurer' });
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
      if (distribution.status === 'draft' && req.membership.role !== 'treasurer') {
        return res.status(404).json({ error: 'Distribution not found' });
      }
      const allocations = await service.getAllocations(distribution.id, { role: req.membership.role, membershipId: req.membership.id });
      res.json({ distribution, allocations });
    } catch (err) { next(err); }
  }
);

// Organizer approves a VERIFIED distribution. Deductions settle now; the
// Treasurer then releases each payout (below), taking the fund down to 0.
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
      await officers.notifyRole({
        groupId: req.params.groupId, role: 'treasurer', skip: [req.member.id],
        type: 'distribution.to_release', title: 'Year-end payouts ready to release',
        message: `The Organizer approved the ${distribution.period} distribution. Release each member's payout from Year-End Distribution.`,
      });
      res.json({ message: "Distribution approved — the Treasurer releases each member's payout next", distribution: finalized });
    } catch (err) {
      if (err.message && err.message.includes('Fund changed since preview')) {
        return res.status(409).json({ error: "The fund or a member's balances changed since the preview. Ask the Treasurer to prepare it again." });
      }
      if (err.message && (err.message.includes('not verified') || err.message.includes('old formula'))) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Treasurer releases one member's approved payout; it leaves the fund now.
router.post(
  '/groups/:groupId/distributions/:id/allocations/:allocationId/release',
  requireAuth,
  requireGroupRole(['treasurer']),
  async (req, res, next) => {
    try {
      const distribution = await service.getDistribution(req.params.id);
      if (distribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Distribution does not belong to this group' });
      }
      const allocation = await service.getAllocation(req.params.allocationId);
      if (!allocation || allocation.distribution_id !== distribution.id) {
        return res.status(404).json({ error: 'Payout not found in this distribution' });
      }
      const released = await service.releasePayout({ allocationId: allocation.id, releasedBy: req.member.id });
      const amount = Number(released.amount) > 0 ? Number(released.amount) : 0;
      const name = allocation.memberships?.members?.full_name ?? 'a member';
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'released', entityType: 'distribution_payout', entityId: allocation.id,
        before: { released: false }, after: { released: true, amount, member: name, period: distribution.period },
      });
      const memberId = allocation.memberships?.member_id;
      if (memberId && memberId !== req.member.id) {
        await notify({
          memberId, groupId: req.params.groupId, type: 'distribution.released',
          title: 'Year-end payout released',
          message: `The Treasurer released your ${distribution.period} year-end payout of ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        });
      }
      const remaining = await service.countUnreleased(distribution.id);
      if (remaining === 0) {
        await officers.notifyRole({
          groupId: req.params.groupId, role: 'owner', skip: [req.member.id],
          type: 'distribution.all_released', title: 'All year-end payouts released',
          message: `Every ${distribution.period} payout has been released. You can close the cycle now.`,
        });
      }
      res.json({ message: 'Payout released', allocation: released, remaining });
    } catch (err) {
      if (err.status === 409) return res.status(409).json({ error: err.message });
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