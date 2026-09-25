// services/api/src/modules/findings/findings.routes.js
// KapitPondo — Audit findings. Auditor submits; Organizer resolves/dismisses;
// both can read. Mount in app.js:  app.use('/api', require('./modules/findings/findings.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./findings.service');

router.get(
  '/groups/:groupId/findings',
  requireAuth,
  requireGroupRole(['auditor', 'owner']),
  async (req, res, next) => {
    try {
      const findings = await service.listFindings({ groupId: req.params.groupId, status: req.query.status });
      res.json({ findings });
    } catch (err) { next(err); }
  }
);

router.post(
  '/groups/:groupId/findings',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const { title, details, recommendation, severity = 'medium', entity_type, entity_id, flag_ids } = req.body;
      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'title is required' });
      }
      if (!service.SEVERITIES.includes(severity)) {
        return res.status(400).json({ error: `severity must be one of ${service.SEVERITIES.join(', ')}` });
      }
      if (!!entity_type !== !!entity_id) {
        return res.status(400).json({ error: 'entity_type and entity_id go together' });
      }
      if (flag_ids !== undefined && (!Array.isArray(flag_ids) || flag_ids.some((id) => typeof id !== 'string'))) {
        return res.status(400).json({ error: 'flag_ids must be a list of flag ids' });
      }
      const finding = await service.submitFinding({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        title: title.trim(), details: details?.trim() || null, recommendation: recommendation?.trim() || null, severity,
        entityType: entity_type, entityId: entity_id, flagIds: flag_ids,
      });
      res.status(201).json({ message: 'Finding submitted to the Organizer', finding });
    } catch (err) { next(err); }
  }
);

// Close a finding as resolved or dismissed — Organizer only, and never one they raised.
router.post(
  '/groups/:groupId/findings/:id/close',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { status, note } = req.body;
      if (!service.CLOSED_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of ${service.CLOSED_STATUSES.join(', ')}` });
      }
      if (status === 'dismissed' && !note?.trim()) {
        return res.status(400).json({ error: 'A note is required to dismiss a finding' });
      }
      const existing = await service.getFinding(req.params.id);
      if (existing.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Finding does not belong to this group' });
      }
      if (existing.raised_by === req.member.id) {
        return res.status(403).json({ error: 'You cannot close a finding you raised' });
      }
      const finding = await service.closeFinding({
        groupId: req.params.groupId, findingId: req.params.id,
        actorId: req.member.id, actorRole: req.membership.role,
        status, note: note?.trim() || null,
      });
      if (!finding) return res.status(409).json({ error: 'Finding is already closed' });
      res.json({ message: status === 'resolved' ? 'Finding resolved' : 'Finding dismissed', finding });
    } catch (err) { next(err); }
  }
);

module.exports = router;
