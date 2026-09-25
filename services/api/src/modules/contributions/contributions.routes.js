const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./contributions.service');
const { checkLatePenaltiesIfDue, splitPenaltyShare, coverPenalties, settlePenaltiesFor } = require('../penalties/penalties.service');
const { logAudit } = require('../../lib/auditLog');
const { notify } = require('../../lib/notifications');
const officers = require('../../lib/officers');
const flags = require('../flags/flags.service');
const { readProofInBackground, readAndSaveProof } = require('../../lib/proofReading');

// Submit a contribution. Nothing posts here — every contribution goes
// confirm (fund holder) → verify (independent check) before the ledger
// (migration 0075). A walk-in recorded by the person who'd confirm it is
// confirmed on recording and waits only for verification. Members record only their
// own (no membership_id in the body — that's how this tells the two flows
// apart). Officers using the "Record new" flow explicitly pass
// membership_id — for a walk-in member (TC-018) OR for their own membership —
// and either way it's tagged is_walk_in so the app can show it in "Awaiting
// Auditor" instead of mixing it into members' own submitted proofs.
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

      // A member paying late covers their pending late penalty in the same
      // transfer; only the contribution share is kept as `amount`.
      const split = isWalkIn
        ? { contributionAmount: amount, penaltyShare: 0, penaltyIds: [] }
        : await splitPenaltyShare({
          groupId: req.params.groupId, membershipId: targetMembershipId,
          heads: req.membership.heads, cycleId: cycle_id, amount,
        });

      const contribution = await service.createContribution({
        membershipId: targetMembershipId,
        cycleId: cycle_id,
        groupId: req.params.groupId,
        amount: split.contributionAmount,
        penaltyApplied: split.penaltyShare,
        paymentMethod: payment_method,
        proofUrl: proof_url,
        // A walk-in with no slip photo gets a generated cash receipt number the Auditor can check against.
        externalReference: external_reference || (isWalkIn && !proof_url ? `CASH-${Date.now().toString(36).toUpperCase()}` : undefined),
        recordedBy: req.member.id,
        isWalkIn,
      });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'recorded', entityType: 'contribution', entityId: contribution.id,
        before: null, after: { status: 'submitted', amount: contribution.amount, walk_in: isWalkIn },
      });
      if (contribution.proof_url) readProofInBackground('contributions', contribution.id);

      let saved = contribution;
      if (isWalkIn && targetMembershipId !== req.membership.id) {
        saved = await service.recordWalkIn({ contributionId: contribution.id, recorderId: req.member.id });
        if (saved.status === 'confirmed') {
          await logAudit({
            groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
            action: 'confirmed', entityType: 'contribution', entityId: contribution.id,
            before: { status: 'submitted' }, after: { status: 'confirmed', amount: contribution.amount, walk_in: true },
          });
        }
        // The member is the third check on a walk-in: they hear about it and can say it's wrong.
        const target = await service.getActiveMembership(targetMembershipId);
        if (target) {
          await notify({
            memberId: target.member_id,
            groupId: req.params.groupId,
            type: 'contribution.walk_in_recorded',
            title: 'Cash contribution recorded',
            message: `${req.member.full_name ?? 'An officer'} recorded ₱${Number(contribution.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} cash from you on ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}. Tap if this isn't right.`,
          });
        }
      }
      await nudgeNextStep({ groupId: req.params.groupId, contribution: saved });
      if (isWalkIn && targetMembershipId !== req.membership.id) return res.status(201).json({ contribution: saved });
      await coverPenalties({ penaltyIds: split.penaltyIds, contributionId: contribution.id });
      res.status(201).json({ contribution: saved });
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
        // Officers filtering to one member's contributions (e.g. building that
        // member's payment timeline before recording a walk-in) — a member
        // caller is already scoped to their own rows above regardless of this.
        filterMembershipId: req.query.membership_id,
      });
      res.json({ contributions });
    } catch (err) { next(err); }
  }
);

// Advisory check the client runs before submitting: has this GCash reference
// already been used in this group? Any active role (members need this
// pre-submit, not just officers reviewing afterward) — non-blocking, just a
// flag shown in the submit form.
router.get('/groups/:groupId/contributions/check-reference',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const ref = req.query.ref;
      if (!ref || typeof ref !== 'string') {
        return res.status(400).json({ error: 'ref is required' });
      }
      const duplicate = await service.hasDuplicateReference(req.params.groupId, ref);
      res.json({ duplicate });
    } catch (err) { next(err); }
  }
);

// The server's reading of the proof (0076) — for records submitted before
// proofs were read automatically, or to retry an unreadable one.
router.post('/groups/:groupId/contributions/:id/read-proof',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const contribution = await service.getContribution(req.params.id);
      if (contribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Contribution does not belong to this group' });
      }
      const reading = await readAndSaveProof('contributions', contribution.id);
      res.json({ reading });
    } catch (err) { next(err); }
  }
);

// Whoever's step it is now hears about it.
async function nudgeNextStep({ groupId, contribution }) {
  const payer = await service.getActiveMembership(contribution.membership_id);
  if (!payer) return;
  const payerRole = await officers.roleOf(groupId, payer.member_id);
  const skip = [payer.member_id, contribution.recorded_by, contribution.confirmed_by].filter(Boolean);
  if (contribution.status === 'submitted') {
    await officers.notifyRole({ groupId, role: officers.confirmRole(payerRole), skip, type: 'contribution.to_confirm', title: 'Contribution to confirm', message: 'A contribution is waiting for you to confirm the money arrived.' });
  } else if (contribution.status === 'confirmed') {
    const recorderRole = contribution.recorded_by ? await officers.roleOf(groupId, contribution.recorded_by) : null;
    await officers.notifyRole({ groupId, role: await officers.verifyRole(groupId, payerRole, recorderRole), skip, type: 'contribution.to_verify', title: 'Contribution to verify', message: 'A confirmed contribution is waiting for your verification.' });
  }
}

const STEP_ERRORS = ['must be confirmed by', 'must be verified by', 'cannot confirm', 'cannot verify', 'cannot also verify', 'You cannot'];

async function confirmStep(req, res, contribution) {
  const saved = await service.confirmContribution({ contributionId: contribution.id, confirmerId: req.member.id });
  await logAudit({
    groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
    action: 'confirmed', entityType: 'contribution', entityId: contribution.id,
    before: { status: contribution.status }, after: { status: 'confirmed', amount: contribution.amount, recorded_by: contribution.recorded_by },
  });
  await nudgeNextStep({ groupId: req.params.groupId, contribution: saved });
  res.json({ message: 'Contribution confirmed — waiting for verification', contribution: saved });
}

async function verifyStep(req, res, contribution) {
  const ledgerEntry = await service.verifyContribution({ contributionId: contribution.id, verifierId: req.member.id });
  await logAudit({
    groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
    action: 'verified', entityType: 'contribution', entityId: contribution.id,
    before: { status: contribution.status }, after: { status: 'approved', amount: contribution.amount, recorded_by: contribution.recorded_by, confirmed_by: contribution.confirmed_by },
  });
  if (Number(contribution.penalty_applied) > 0) {
    const settled = await settlePenaltiesFor({ contributionId: contribution.id, approverId: req.member.id });
    for (const p of settled) {
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'paid', entityType: 'penalty', entityId: p.id,
        before: { status: 'pending' }, after: { status: 'paid', amount: p.amount, contribution_id: contribution.id },
      });
    }
  }
  res.json({ message: 'Contribution verified and posted', ledgerEntry });
}

function stepRoute(pick) {
  return async (req, res, next) => {
    try {
      const contribution = await service.getContribution(req.params.id);
      if (contribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Contribution does not belong to this group' });
      }
      const step = pick(contribution);
      if (!step) return res.status(409).json({ error: 'Contribution is not waiting for this step' });
      await step(req, res, contribution);
    } catch (err) {
      if (err.message && STEP_ERRORS.some((m) => err.message.includes(m))) {
        return res.status(403).json({ error: err.message });
      }
      next(err);
    }
  };
}

const officerOnly = requireGroupRole(['treasurer', 'auditor', 'owner']);

// Step 1 — confirm the money arrived (Treasurer; Organizer for the Treasurer's own).
router.post('/groups/:groupId/contributions/:id/confirm', requireAuth, officerOnly,
  stepRoute((c) => (c.status === 'submitted' ? confirmStep : null)));

// Step 2 — verify and post (Auditor; Organizer for the Auditor's own).
router.post('/groups/:groupId/contributions/:id/verify', requireAuth, officerOnly,
  stepRoute((c) => (c.status === 'confirmed' ? verifyStep : null)));

// Older clients: "approve" does whichever step is next.
router.post('/groups/:groupId/contributions/:id/approve', requireAuth, officerOnly,
  stepRoute((c) => (c.status === 'submitted' ? confirmStep : c.status === 'confirmed' ? verifyStep : null)));

// The member's "This isn't right" on a contribution recorded for them — raises
// a flag the Auditor sees; blocks nothing.
router.post('/groups/:groupId/contributions/:id/dispute',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const contribution = await service.getContribution(req.params.id);
      if (contribution.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Contribution does not belong to this group' });
      }
      if (contribution.membership_id !== req.membership.id) {
        return res.status(403).json({ error: 'You can only dispute a contribution recorded for you' });
      }
      if (await flags.hasOpenFlag({ entityId: contribution.id, raisedBy: req.member.id })) {
        return res.status(409).json({ error: "You've already reported this one — the Auditor is looking into it" });
      }
      const flag = await flags.raiseFlag({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        entityType: 'contribution', entityId: contribution.id,
        reason: "Member says this isn't right", note: req.body?.note?.trim() || null,
        label: `${req.member.full_name ?? 'A member'}'s contribution`,
      });
      await officers.notifyRole({
        groupId: req.params.groupId, role: 'auditor', skip: [req.member.id],
        type: 'audit.flagged', title: 'A member disputed a contribution',
        message: `${req.member.full_name ?? 'A member'} says a contribution recorded for them isn't right.`,
      });
      res.status(201).json({ message: 'Thanks — the Auditor will look into it', flag });
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
      if (!updated) return res.status(409).json({ error: 'Contribution is not waiting for confirmation or verification' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'rejected', entityType: 'contribution', entityId: req.params.id,
        before: { status: contribution.status }, after: { status: 'rejected', reason: req.body?.reason ?? null },
      });
      res.json({ message: 'Contribution rejected', contribution: updated });
    } catch (err) { next(err); }
  }
);

module.exports = router;