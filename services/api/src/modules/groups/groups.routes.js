const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./groups.service');
const { logAudit } = require('../../lib/auditLog');
const { notify } = require('../../lib/notifications');

// Current member profile (auth middleware already resolved req.member)
router.get('/me/profile', requireAuth, (req, res) => {
  res.json({ member: req.member });
});

// Create a group — the calling member becomes its owner
router.post('/groups', requireAuth, async (req, res, next) => {
  try {
    if (req.member.verification_status !== 'verified') {
      return res.status(403).json({ error: 'Only verified members can create a group' });
    }
    const { name, fund_code, description } = req.body;
    if (!name || !fund_code) {
      return res.status(400).json({ error: 'name and fund_code are required' });
    }
    const group = await service.createGroup({
      name,
      fundCode:      fund_code,
      description,
      ownerMemberId: req.member.id,
    });
    res.status(201).json({ group });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That fund_code is already taken' });
    }
    next(err);
  }
});

// Join a group by fund code — creates a pending membership
router.post('/groups/join-by-code', requireAuth, async (req, res, next) => {
  try {
    const { fund_code } = req.body;
    if (!fund_code) {
      return res.status(400).json({ error: 'fund_code is required' });
    }
    const result = await service.joinByCode({ memberId: req.member.id, fundCode: fund_code });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: err.message });
    }
    if (err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// List groups the current member belongs to
router.get('/groups', requireAuth, async (req, res, next) => {
  try {
    const groups = await service.listMyGroups(req.member.id);
    res.json({ groups });
  } catch (err) { next(err); }
});

// Get one group (must be a member of it)
router.get('/groups/:groupId', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const group = await service.getGroup(req.params.groupId);
      res.json({ group });
    } catch (err) { next(err); }
  }
);

const GCASH_NUMBER_RE = /^09\d{9}$/;

// ── GCash channel: Treasurer proposes, Owner approves (segregation of
// duties — see migration 0056 / groups.service.js's comment block) ────────

// Treasurer submits a GCash number for the Owner's approval.
router.post('/groups/:groupId/gcash/propose', requireAuth,
  requireGroupRole(['treasurer']),
  async (req, res, next) => {
    try {
      const { number, name, note, qr_url } = req.body;
      if (!number || !GCASH_NUMBER_RE.test(number)) {
        return res.status(400).json({ error: 'number must be a PH mobile number like 09171234567' });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      const group = await service.submitGcashProposal(req.params.groupId, {
        number, name: name.trim(), note: note?.trim() || null, qrUrl: qr_url || null, submittedBy: req.member.id,
      });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'proposed', entityType: 'group_gcash', entityId: req.params.groupId,
        before: null, after: { number, name: name.trim(), note: note?.trim() || null },
      });
      if (group.owner_id) {
        await notify({
          memberId: group.owner_id, groupId: req.params.groupId,
          type: 'gcash.proposed', title: 'GCash number needs your approval',
          message: `${req.member.full_name ?? 'The Treasurer'} submitted a GCash number for the group.`,
        });
      }
      res.status(201).json({ group });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  }
);

// Treasurer withdraws their own pending submission.
router.post('/groups/:groupId/gcash/cancel', requireAuth,
  requireGroupRole(['treasurer']),
  async (req, res, next) => {
    try {
      const group = await service.cancelGcashProposal(req.params.groupId, req.member.id);
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'cancelled', entityType: 'group_gcash', entityId: req.params.groupId,
        before: null, after: null,
      });
      res.json({ group });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  }
);

// Owner approves — the pending number becomes visible to members.
router.post('/groups/:groupId/gcash/approve', requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { group, submittedBy } = await service.approveGcashProposal(req.params.groupId, req.member.id);
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'approved', entityType: 'group_gcash', entityId: req.params.groupId,
        before: null, after: { number: group.treasurer_gcash_number, name: group.treasurer_gcash_name },
      });
      if (submittedBy) {
        await notify({
          memberId: submittedBy, groupId: req.params.groupId,
          type: 'gcash.approved', title: 'GCash number approved',
          message: 'The Owner approved the GCash number. Members can now see it.',
        });
      }
      res.json({ group });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  }
);

// Owner rejects, with a reason the Treasurer sees.
router.post('/groups/:groupId/gcash/reject', requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const reason = req.body?.reason?.trim();
      if (!reason) return res.status(400).json({ error: 'reason is required' });
      const { group, submittedBy } = await service.rejectGcashProposal(req.params.groupId, req.member.id, reason);
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'rejected', entityType: 'group_gcash', entityId: req.params.groupId,
        before: null, after: { reason },
      });
      if (submittedBy) {
        await notify({
          memberId: submittedBy, groupId: req.params.groupId,
          type: 'gcash.rejected', title: 'GCash number rejected',
          message: reason,
        });
      }
      res.json({ group });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  }
);

// Change history for the GCash channel — Treasurer (their own proposals) and Owner.
router.get('/groups/:groupId/gcash/history', requireAuth,
  requireGroupRole(['treasurer', 'owner']),
  async (req, res, next) => {
    try {
      const entries = await service.listGcashHistory(req.params.groupId);
      res.json({ entries });
    } catch (err) { next(err); }
  }
);

// List pending member requests (owner / treasurer / auditor only)
router.get('/groups/:groupId/members/pending', requireAuth,
  requireGroupRole(['owner', 'treasurer', 'auditor']),
  async (req, res, next) => {
    try {
      const members = await service.listPendingMembers(req.params.groupId);
      res.json({ members });
    } catch (err) { next(err); }
  }
);

// Approve a pending membership
router.patch('/groups/:groupId/members/:memberId/approve', requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const membership = await service.approveMember(req.params.groupId, req.params.memberId);
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'approved', entityType: 'membership_approval', entityId: req.params.memberId,
        before: { status: 'pending' }, after: { status: 'active' },
      });
      res.json({ membership });
    } catch (err) { next(err); }
  }
);

// Reject (delete) a pending membership
router.patch('/groups/:groupId/members/:memberId/reject', requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const membership = await service.rejectMember(req.params.groupId, req.params.memberId, req.body?.reason);
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'rejected', entityType: 'membership_approval', entityId: req.params.memberId,
        before: { status: 'pending' }, after: { status: 'rejected', reason: req.body?.reason ?? null },
      });
      res.json({ membership });
    } catch (err) { next(err); }
  }
);

// List officers (owner/treasurer/auditor names) + total member count — any
// active member may see who runs their group. Deliberately separate from the
// officer-only /members route below (no email/phone exposed to members).
router.get('/groups/:groupId/officers', requireAuth,
  requireGroupRole(['member', 'owner', 'treasurer', 'auditor']),
  async (req, res, next) => {
    try {
      const result = await service.listOfficers(req.params.groupId);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// Member-safe directory — every active member's name + role, no email/phone.
// Any active role may see this (the officer-only /members below has more detail).
router.get('/groups/:groupId/members/directory', requireAuth,
  requireGroupRole(['member', 'owner', 'treasurer', 'auditor']),
  async (req, res, next) => {
    try {
      const members = await service.listMemberDirectory(req.params.groupId);
      res.json({ members });
    } catch (err) { next(err); }
  }
);

// List all active members of a group (officer+ only)
router.get('/groups/:groupId/members', requireAuth,
  requireGroupRole(['owner', 'treasurer', 'auditor']),
  async (req, res, next) => {
    try {
      const members = await service.listGroupMembers(req.params.groupId);
      res.json({ members });
    } catch (err) { next(err); }
  }
);

// Update a member's role — promote/demote (owner only)
router.patch('/groups/:groupId/members/:memberId/role', requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { role } = req.body;
      if (!['member', 'treasurer', 'auditor'].includes(role)) {
        return res.status(400).json({ error: 'role must be member, treasurer, or auditor' });
      }
      const { membership, previousRole } = await service.updateMemberRole(req.params.groupId, req.params.memberId, role);
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'role_changed', entityType: 'membership_role', entityId: req.params.memberId,
        before: { role: previousRole }, after: { role },
      });
      res.json({ membership });
    } catch (err) { next(err); }
  }
);

// Officer sends a reminder push to a specific member (e.g. behind on
// contributions). Treasurer/Auditor/Owner — any officer, not owner-only.
router.post('/groups/:groupId/members/:memberId/nudge', requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      await service.nudgeMember(req.params.groupId, req.params.memberId);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// Remove an active member (owner only)
router.delete('/groups/:groupId/members/:memberId', requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      await service.removeMember(req.params.groupId, req.params.memberId);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// Self-service: the caller leaves their own group. Blocked (409) if they're
// the Owner, or have an active loan / unresolved penalty — see
// leaveGroup()'s comment for why.
router.post('/groups/:groupId/leave', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      await service.leaveGroup(req.params.groupId, req.member.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
