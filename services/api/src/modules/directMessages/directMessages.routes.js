// Mount in app.js:  app.use('/api', require('./modules/directMessages/directMessages.routes'));
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./directMessages.service');
const { notify } = require('../../lib/notifications');

const MAX_BODY_LEN = 2000; // mirrors the DB check constraint in 0050_direct_messages.sql

// GET /api/groups/:groupId/direct-messages/:otherMemberId?limit=&before=<ISO>
// Any active member can open a conversation with any other active member —
// that's the point of "Contact an officer"/"Members" (an officer is just a
// member with a role), so there's no capability gate beyond active
// membership on both sides.
router.get('/groups/:groupId/direct-messages/:otherMemberId', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const { groupId, otherMemberId } = req.params;
      if (otherMemberId === req.member.id) {
        return res.status(400).json({ error: "You can't message yourself" });
      }
      const otherActive = await service.isActiveMember(groupId, otherMemberId);
      if (!otherActive) {
        return res.status(404).json({ error: 'That member is not active in this group' });
      }
      const messages = await service.listConversation({
        groupId, memberId: req.member.id, otherId: otherMemberId,
        limit: req.query.limit, before: req.query.before,
      });
      res.json({ messages });
    } catch (err) { next(err); }
  }
);

// POST /api/groups/:groupId/direct-messages  { recipient_id, body, image_url? }
router.post('/groups/:groupId/direct-messages', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { recipient_id, body, image_url } = req.body;
      if (!recipient_id) {
        return res.status(400).json({ error: 'recipient_id is required' });
      }
      if (recipient_id === req.member.id) {
        return res.status(400).json({ error: "You can't message yourself" });
      }
      const trimmed = typeof body === 'string' ? body.trim() : '';
      const imageUrl = typeof image_url === 'string' && image_url.trim() ? image_url.trim() : null;
      if (!trimmed && !imageUrl) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }
      if (trimmed.length > MAX_BODY_LEN) {
        return res.status(400).json({ error: `Message must be ${MAX_BODY_LEN} characters or fewer` });
      }

      const recipientActive = await service.isActiveMember(groupId, recipient_id);
      if (!recipientActive) {
        return res.status(404).json({ error: 'That member is not active in this group' });
      }

      const message = await service.sendDirectMessage({
        groupId, senderId: req.member.id, senderName: req.member.full_name,
        recipientId: recipient_id, body: trimmed, imageUrl,
      });

      // Unlike group chat (chat.service.js never calls notify — too noisy
      // for a busy shared room), a DM is 1:1 and personal, so the recipient
      // gets pinged even if they aren't in the app right now.
      await notify({
        memberId: recipient_id,
        groupId,
        type: 'direct_message',
        title: req.member.full_name ?? 'New message',
        message: !trimmed && imageUrl ? '📷 Photo' : trimmed,
      });

      res.status(201).json({ message });
    } catch (err) { next(err); }
  }
);

module.exports = router;
