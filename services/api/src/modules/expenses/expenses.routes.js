// services/api/src/modules/expenses/expenses.routes.js
// KapitPondo — Expenses routes (M7, FINAL)
// Mount in app.js:  app.use('/api', require('./modules/expenses/expenses.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./expenses.service');

// Record an expense (treasurer or owner)
router.post(
  '/groups/:groupId/expenses',
  requireAuth,
  requireGroupRole(['treasurer', 'owner']),
  async (req, res, next) => {
    try {
      const { amount, category, description, proof_url } = req.body;
      if (amount == null) return res.status(400).json({ error: 'amount is required' });
      const expense = await service.createExpense({
        groupId: req.params.groupId,
        amount,
        category,
        description,
        proofUrl: proof_url,
        recordedBy: req.member.id,
      });
      res.status(201).json({ expense });
    } catch (err) { next(err); }
  }
);

// List expenses (officers)
router.get(
  '/groups/:groupId/expenses',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const expenses = await service.listExpenses({
        groupId: req.params.groupId,
        status: req.query.status,
      });
      res.json({ expenses });
    } catch (err) { next(err); }
  }
);

// Approve an expense (officer, not the recorder) — posts a debit
router.post(
  '/groups/:groupId/expenses/:id/approve',
  requireAuth,
  requireGroupRole(['owner', 'auditor']),
  async (req, res, next) => {
    try {
      const expense = await service.getExpense(req.params.id);
      if (expense.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Expense does not belong to this group' });
      }
      if (expense.recorded_by === req.member.id) {
        return res.status(403).json({ error: 'You cannot approve an expense you recorded' });
      }
      const ledgerEntry = await service.approveExpense({
        expenseId: req.params.id,
        approverId: req.member.id,
      });
      res.json({ message: 'Expense approved', ledgerEntry });
    } catch (err) {
      if (err.message && err.message.includes('Insufficient fund')) {
        return res.status(409).json({ error: err.message });
      }
      if (err.message && err.message.includes('must be confirmed by the Auditor')) {
        return res.status(403).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Reject an expense, with a reason the recorder can see (officer, not the recorder)
router.post(
  '/groups/:groupId/expenses/:id/reject',
  requireAuth,
  requireGroupRole(['owner', 'auditor']),
  async (req, res, next) => {
    try {
      const expense = await service.getExpense(req.params.id);
      if (expense.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Expense does not belong to this group' });
      }
      if (expense.recorded_by === req.member.id) {
        return res.status(403).json({ error: 'You cannot reject an expense you recorded' });
      }
      const updated = await service.rejectExpense(req.params.id, req.body?.reason);
      res.json({ message: 'Expense rejected', expense: updated });
    } catch (err) { next(err); }
  }
);

module.exports = router;