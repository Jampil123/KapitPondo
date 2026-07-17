const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./groups.service');

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
      const membership = await service.updateMemberRole(req.params.groupId, req.params.memberId, role);
      res.json({ membership });
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

module.exports = router;
