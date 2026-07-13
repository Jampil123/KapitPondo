const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./chat.service');

const CHANNELS = ['officers', 'general'];
const OFFICER_ROLES = ['owner', 'treasurer', 'auditor'];
const MAX_BODY_LEN = 2000; // mirrors the DB check constraint in 0018_messages.sql

function isValidChannel(c) {
  return CHANNELS.includes(c);
}

// GET /api/groups/:groupId/messages?channel=general&limit=30&before=<ISO>
router.get('/groups/:groupId/messages', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']), // broad: any active member
  async (req, res, next) => {
    try {
      const { channel, limit, before } = req.query;
      if (!isValidChannel(channel)) {
        return res.status(400).json({ error: "channel must be 'officers' or 'general'" });
      }
      // Extra in-handler gate: officers channel needs an officer role.
      // requireGroupRole only checked "any active member" above.
      if (channel === 'officers' && !OFFICER_ROLES.includes(req.membership.role)) {
        return res.status(403).json({ error: 'Only officers can view the officers room' });
      }
      const messages = await service.listMessages({ groupId: req.params.groupId, channel, limit, before });
      res.json({ messages });
    } catch (err) { next(err); }
  }
);

// POST /api/groups/:groupId/messages  { channel, body }
router.post('/groups/:groupId/messages', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const { channel, body } = req.body;
      if (!isValidChannel(channel)) {
        return res.status(400).json({ error: "channel must be 'officers' or 'general'" });
      }
      if (channel === 'officers' && !OFFICER_ROLES.includes(req.membership.role)) {
        return res.status(403).json({ error: 'Only officers can post in the officers room' });
      }
      const trimmed = typeof body === 'string' ? body.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }
      if (trimmed.length > MAX_BODY_LEN) {
        return res.status(400).json({ error: `Message must be ${MAX_BODY_LEN} characters or fewer` });
      }
      const message = await service.sendMessage({
        groupId: req.params.groupId,
        channel,
        senderId: req.member.id,
        senderName: req.member.full_name,
        body: trimmed,
      });
      res.status(201).json({ message });
    } catch (err) { next(err); }
  }
);

module.exports = router;
