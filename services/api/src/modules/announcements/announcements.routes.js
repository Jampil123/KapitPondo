// Mount in app.js:  app.use('/api', require('./modules/announcements/announcements.routes'));
const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./announcements.service');
const { logAudit } = require('../../lib/auditLog');

const TYPES = ['reminder', 'meeting', 'cycle', 'urgent'];
const AUDIENCES = ['all', 'unpaid', 'officers'];
const MAX_BODY_LEN = 1000; // mirrors the DB check constraint in 0048_announcements.sql
const MAX_REMINDER_LEN = 500;

// GET /api/groups/:groupId/announcements?limit=&before=<ISO>
router.get('/groups/:groupId/announcements', requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']), // any active member reads
  async (req, res, next) => {
    try {
      const announcements = await service.listAnnouncements({
        groupId: req.params.groupId, limit: req.query.limit, before: req.query.before,
      });
      res.json({ announcements });
    } catch (err) { next(err); }
  }
);

// POST /api/groups/:groupId/announcements  { type, body, audience, send_push? }
// Owner only — announcements speak for the group, not for one officer.
router.post('/groups/:groupId/announcements', requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { type, body, audience, send_push } = req.body;
      if (!TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });
      }
      if (!AUDIENCES.includes(audience)) {
        return res.status(400).json({ error: `audience must be one of: ${AUDIENCES.join(', ')}` });
      }
      const trimmed = typeof body === 'string' ? body.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }
      if (trimmed.length > MAX_BODY_LEN) {
        return res.status(400).json({ error: `Message must be ${MAX_BODY_LEN} characters or fewer` });
      }

      const announcement = await service.createAnnouncement({
        groupId: req.params.groupId,
        senderId: req.member.id,
        senderName: req.member.full_name,
        senderRole: req.membership.role,
        type,
        body: trimmed,
        audience,
        sendPush: send_push !== false,
      });

      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'announcement_posted', entityType: 'announcement', entityId: announcement.id,
        before: null, after: { type, audience, recipient_count: announcement.recipient_count },
      });

      res.status(201).json({ announcement });
    } catch (err) { next(err); }
  }
);

// GET /api/groups/:groupId/members/unpaid — officer-only; who hasn't paid
// the current period yet (drives the Treasurer's reminder audience preview
// and the "unpaid" announcement audience).
router.get('/groups/:groupId/members/unpaid', requireAuth,
  requireGroupRole(['owner', 'treasurer', 'auditor']),
  async (req, res, next) => {
    try {
      const members = await service.resolveUnpaidMembers(req.params.groupId);
      res.json({ members });
    } catch (err) { next(err); }
  }
);

// POST /api/groups/:groupId/members/remind  { message }
// Sends a private reminder to every member who hasn't paid this period.
// Owner/Treasurer only — collection is their duty (same gate as
// recordRepayment/approveContribution's officer-money actions), not the
// Auditor's.
router.post('/groups/:groupId/members/remind', requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const trimmed = typeof req.body.message === 'string' ? req.body.message.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }
      if (trimmed.length > MAX_REMINDER_LEN) {
        return res.status(400).json({ error: `Message must be ${MAX_REMINDER_LEN} characters or fewer` });
      }

      const result = await service.sendReminder({ groupId: req.params.groupId, body: trimmed });

      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'reminder_sent', entityType: 'payment_reminder', entityId: null,
        before: null, after: { recipient_count: result.sent_count, message: trimmed },
      });

      res.json(result);
    } catch (err) { next(err); }
  }
);

module.exports = router;
