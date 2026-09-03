// services/api/src/modules/auditlog/auditlog.routes.js
// KapitPondo — Audit log read side. Auditor + Owner only: this is oversight
// data (who approved/rejected/changed what), not something every member or
// even every officer needs to browse.
// Mount in app.js:  app.use('/api', require('./modules/auditlog/auditlog.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./auditlog.service');

router.get(
  '/groups/:groupId/audit-log',
  requireAuth,
  requireGroupRole(['auditor', 'owner']),
  async (req, res, next) => {
    try {
      const entries = await service.listAuditLog({
        groupId: req.params.groupId,
        category: req.query.category,
        search: req.query.search,
        before: req.query.before,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ entries });
    } catch (err) { next(err); }
  }
);

// Flag a posting as a concern for the Owner — Auditor only. Does NOT touch
// the ledger; correcting figures still goes through the real reversal
// workflow. entity_type/entity_id identify the posting being flagged
// (contribution/expense/loan_payment/loan_disbursement); label is a short
// human-readable description the client already has on screen, so the
// Owner's notification reads sensibly without the API re-deriving it.
router.post(
  '/groups/:groupId/audit-log/flag',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const { entity_type, entity_id, note, label } = req.body;
      if (!entity_type || !entity_id) {
        return res.status(400).json({ error: 'entity_type and entity_id are required' });
      }
      await service.flagPosting({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        entityType: entity_type, entityId: entity_id, note, label,
      });
      res.status(201).json({ message: 'Flagged for the Owner' });
    } catch (err) { next(err); }
  }
);

// Ask whoever recorded a proof-less posting to supply one — Auditor only.
router.post(
  '/groups/:groupId/audit-log/ask-proof',
  requireAuth,
  requireGroupRole(['auditor']),
  async (req, res, next) => {
    try {
      const { entity_type, entity_id, recorded_by, label } = req.body;
      if (!entity_type || !entity_id || !recorded_by) {
        return res.status(400).json({ error: 'entity_type, entity_id and recorded_by are required' });
      }
      await service.askForProof({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        entityType: entity_type, entityId: entity_id, recordedBy: recorded_by, label,
      });
      res.status(201).json({ message: 'Asked for proof' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
