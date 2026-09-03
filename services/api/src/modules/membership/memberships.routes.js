const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./memberships.service');
const { logAudit } = require('../../lib/auditLog');

// Request to join a group (by fund_code → groupId resolved on client or here)
router.post('/groups/:groupId/join', requireAuth, async (req, res, next) => {
  try {
    if (req.member.verification_status !== 'verified') {
      return res.status(403).json({ error: 'Only verified members can join a group' });
    }
    const membership = await service.requestToJoin({
      memberId: req.member.id, groupId: req.params.groupId,
    });
    res.status(201).json({ membership });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You already have a membership in this group' });
    }
    next(err);
  }
});

// List memberships in a group (officers only)
router.get('/groups/:groupId/memberships', requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const memberships = await service.listMemberships({
        groupId: req.params.groupId, status: req.query.status,
      });
      res.json({ memberships });
    } catch (err) { next(err); }
  }
);

// Approve a pending member (owner or treasurer)
router.post('/groups/:groupId/memberships/:id/approve', requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const membership = await service.approveMembership({
        membershipId: req.params.id, approverId: req.member.id,
      });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'approved', entityType: 'membership_approval', entityId: req.params.id,
        before: { status: 'pending' }, after: { status: 'active' },
      });
      res.json({ message: 'Member approved', membership });
    } catch (err) { next(err); }
  }
);

// Assign a role (owner only)
router.patch('/groups/:groupId/memberships/:id/role', requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { role } = req.body;
      const allowed = ['member', 'treasurer', 'auditor', 'owner'];
      if (!allowed.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      const { membership, previousRole } = await service.setRole({ membershipId: req.params.id, role });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'role_changed', entityType: 'membership_role', entityId: req.params.id,
        before: { role: previousRole }, after: { role },
      });
      res.json({ message: 'Role updated', membership });
    } catch (err) { next(err); }
  }
);

module.exports = router;