// services/api/src/modules/flags/flags.routes.js
// KapitPondo — Audit flags (migration 0070). Auditor raises (still via
// POST /audit-log/flag, see auditlog.routes.js); Organizer resolves or
// dismisses; both can read. Mount in app.js:  app.use('/api', require('./modules/flags/flags.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./flags.service');

router.get(
  '/groups/:groupId/flags',
  requireAuth,
  requireGroupRole(['auditor', 'owner']),
  async (req, res, next) => {
    try {
      const flags = await service.listFlags({ groupId: req.params.groupId, status: req.query.status });
      res.json({ flags });
    } catch (err) { next(err); }
  }
);

router.get(
  '/groups/:groupId/flags/:id',
  requireAuth,
  requireGroupRole(['auditor', 'owner']),
  async (req, res, next) => {
    try {
      const detail = await service.getFlagDetail({ groupId: req.params.groupId, flagId: req.params.id });
      if (!detail) return res.status(404).json({ error: 'Flag not found' });
      res.json(detail);
    } catch (err) { next(err); }
  }
);

// Close a flag as resolved or dismissed — Organizer only, and never one they raised.
router.post(
  '/groups/:groupId/flags/:id/close',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { status, note } = req.body;
      if (!service.CLOSED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of ${service.CLOSED_STATUSES.join(', ')}` });
      }
      if (status === 'dismissed' && !note?.trim()) {
        return res.status(400).json({ error: 'A note is required to dismiss a flag' });
      }
      const existing = await service.getFlag(req.params.id);
      if (existing.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Flag does not belong to this group' });
      }
      if (existing.raised_by === req.member.id) {
        return res.status(403).json({ error: 'You cannot close a flag you raised' });
      }
      const flag = await service.closeFlag({
        groupId: req.params.groupId, flagId: req.params.id,
        actorId: req.member.id, actorRole: req.membership.role,
        status, note: note?.trim() || null,
      });
      if (!flag) return res.status(409).json({ error: 'Flag is already closed' });
      res.json({ message: status === 'resolved' ? 'Flag resolved' : 'Flag dismissed', flag });
    } catch (err) { next(err); }
  }
);

module.exports = router;
