// services/api/src/modules/reporting/reporting.routes.js
// KapitPondo — Reporting routes (M8, FINAL)
// Mount in app.js:  app.use('/api', require('./modules/reporting/reporting.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./reporting.service');

// Group financial summary (officers)
router.get(
  '/groups/:groupId/reports/summary',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const summary = await service.groupSummary(req.params.groupId);
      res.json({ summary });
    } catch (err) { next(err); }
  }
);

// Member-safe aggregate fund snapshot — deliberately separate from
// /reports/summary (officer-only) per the transparency doc's "aggregate-only"
// rule for members; reuses the same group_summary RPC.
router.get(
  '/groups/:groupId/reports/fund-summary',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const summary = await service.fundSummary(req.params.groupId);
      res.json({ summary });
    } catch (err) { next(err); }
  }
);

// Per-member balances across the group (officers)
router.get(
  '/groups/:groupId/reports/member-balances',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const balances = await service.memberBalances(req.params.groupId);
      res.json({ balances });
    } catch (err) { next(err); }
  }
);

// Member-safe, GROUP-WIDE ledger — every posting in the group, by name and
// amount, deliberately NOT self-scoped (unlike /reports/ledger below). This
// is a real transparency policy, not an oversight: any active member can see
// every other member's individual contribution/loan amounts here. Proof
// images aren't exposed by this (or any ledger route) — a ledger row only
// carries source_type/source_id, and fetching the underlying proof still
// goes through the normal per-record access rules.
router.get(
  '/groups/:groupId/reports/fund-ledger',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const ledger = await service.groupLedger({
        groupId: req.params.groupId,
        entryType: req.query.entry_type,
        limit: req.query.limit ? Number(req.query.limit) : 300,
      });
      res.json({ ledger });
    } catch (err) { next(err); }
  }
);

// The ledger feed. Members see only their own entries; officers see all.
router.get(
  '/groups/:groupId/reports/ledger',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const isMember = req.membership.role === 'member';
      const ledger = await service.groupLedger({
        groupId: req.params.groupId,
        membershipId: isMember ? req.membership.id : req.query.membership_id,
        entryType: req.query.entry_type,
        limit: req.query.limit ? Number(req.query.limit) : 100,
      });
      res.json({ ledger });
    } catch (err) { next(err); }
  }
);

// The current member's own balance in this group (any member)
router.get(
  '/groups/:groupId/reports/my-balance',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const balance = await service.myBalance(req.membership.id);
      res.json(balance);
    } catch (err) { next(err); }
  }
);

module.exports = router;