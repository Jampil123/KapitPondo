// services/api/src/modules/loanAudits/loanAudits.routes.js
// KapitPondo — Loan decision audits (read-only). Auditor + Organizer.
// Mount in app.js:  app.use('/api', require('./modules/loanAudits/loanAudits.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./loanAudits.service');

router.get(
  '/groups/:groupId/loan-audits',
  requireAuth,
  requireGroupRole(['auditor', 'owner']),
  async (req, res, next) => {
    try {
      const audits = await service.listLoanAudits({ groupId: req.params.groupId });
      res.json({ audits });
    } catch (err) { next(err); }
  }
);

router.get(
  '/groups/:groupId/loan-audits/:loanId',
  requireAuth,
  requireGroupRole(['auditor', 'owner']),
  async (req, res, next) => {
    try {
      const audit = await service.getLoanAudit({ groupId: req.params.groupId, loanId: req.params.loanId });
      if (!audit) return res.status(404).json({ error: 'No approved loan with that id' });
      res.json(audit);
    } catch (err) { next(err); }
  }
);

module.exports = router;
