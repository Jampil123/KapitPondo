const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./chatReads.service');
const { isActiveMember } = require('../directMessages/directMessages.service');

const ANY_ROLE = ['member', 'treasurer', 'auditor', 'owner'];
const OFFICER_ROLES = ['owner', 'treasurer', 'auditor'];
const ROOMS = ['general', 'officers'];
const DM = /^dm:([0-9a-f-]{36})$/;

// Whether the caller may hold a read mark on `conversation` — mirrors who can
// open it (chat.routes.js, directMessages.routes.js).
async function canRead(req, conversation) {
  if (conversation === 'general' || conversation === 'announcements') return true;
  if (conversation === 'officers') return OFFICER_ROLES.includes(req.membership.role);
  const dm = DM.exec(conversation);
  if (!dm || dm[1] === req.member.id) return false;
  return isActiveMember(req.params.groupId, dm[1]);
}

// GET /api/groups/:groupId/chat-reads — { mine: { [conversation]: at }, theirs: { [memberId]: at } }
router.get('/groups/:groupId/chat-reads', requireAuth, requireGroupRole(ANY_ROLE),
  async (req, res, next) => {
    try {
      res.json(await service.listForMember(req.params.groupId, req.member.id));
    } catch (err) { next(err); }
  }
);

// PUT /api/groups/:groupId/chat-reads/:conversation — mark it read now.
router.put('/groups/:groupId/chat-reads/:conversation', requireAuth, requireGroupRole(ANY_ROLE),
  async (req, res, next) => {
    try {
      const { conversation } = req.params;
      if (!(await canRead(req, conversation))) {
        return res.status(403).json({ error: "You can't open that conversation" });
      }
      res.json({ read: await service.markRead(req.params.groupId, req.member.id, conversation) });
    } catch (err) { next(err); }
  }
);

// GET /api/groups/:groupId/chat-reads/:conversation/readers — others' marks on a room, for "Seen by".
router.get('/groups/:groupId/chat-reads/:conversation/readers', requireAuth, requireGroupRole(ANY_ROLE),
  async (req, res, next) => {
    try {
      const { conversation } = req.params;
      if (!ROOMS.includes(conversation) || !(await canRead(req, conversation))) {
        return res.status(403).json({ error: "You can't open that conversation" });
      }
      res.json({ readers: await service.roomReaders(req.params.groupId, conversation, req.member.id) });
    } catch (err) { next(err); }
  }
);

module.exports = router;
