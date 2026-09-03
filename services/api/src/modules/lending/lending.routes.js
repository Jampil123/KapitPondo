// services/api/src/modules/lending/lending.routes.js
// KapitPondo — Lending routes (FINAL)
// Mount in app.js:  app.use('/api', require('./modules/lending/lending.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./lending.service');
const { logAudit } = require('../../lib/auditLog');

// Apply for a loan — member supplies amount, term, purpose (NOT the rate).
// Verified members only (TC-035) — the mobile UI already gated this
// client-side, but nothing stopped a direct API call before.
router.post(
  '/groups/:groupId/loans',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      if (req.member.verification_status !== 'verified') {
        return res.status(403).json({ error: 'Only verified members can request a loan' });
      }
      const { principal, term_months, purpose } = req.body;
      if (principal == null || term_months == null) {
        return res.status(400).json({ error: 'principal and term_months are required' });
      }
      const loan = await service.applyForLoan({
        membershipId: req.membership.id,
        groupId: req.params.groupId,
        principal,
        termMonths: term_months,
        purpose,
      });
      res.status(201).json({ loan });
    } catch (err) {
      next(err);
    }
  }
);

// List loans (members see own; officers see all)
router.get(
  '/groups/:groupId/loans',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const loans = await service.listLoans({
        groupId: req.params.groupId,
        membershipId: req.membership.id,
        role: req.membership.role,
        status: req.query.status,
      });
      res.json({ loans });
    } catch (err) {
      next(err);
    }
  }
);

// Member-safe pre-application check: "am I eligible to request a loan right
// now" + how much cash the fund has — same 3 checks as the officer's
// per-loan eligibility below, just run against the caller's own membership
// before any loan exists to check against. Registered BEFORE /loans/:id so
// "eligibility" isn't swallowed as a loan id (same reasoning as /repayments
// being kept off /loans/:id further down).
router.get(
  '/groups/:groupId/loans/eligibility',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const { eligible, reasons } = await service.checkEligibilityForMembership(req.membership.id);
      const availableCash = await service.availableCash(req.params.groupId);
      res.json({ eligible, reasons, available_cash: availableCash });
    } catch (err) { next(err); }
  }
);

// Get one loan + its payments
router.get(
  '/groups/:groupId/loans/:id',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const loan = await service.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      if (req.membership.role === 'member' && loan.membership_id !== req.membership.id) {
        return res.status(403).json({ error: 'You can only view your own loans' });
      }
      const payments = await service.getLoanPayments(loan.id);
      res.json({ loan, payments });
    } catch (err) {
      next(err);
    }
  }
);

// What the Owner reviews before approving/rejecting (TC-013, TC-014, TC-034)
router.get(
  '/groups/:groupId/loans/:id/eligibility',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const { eligible, reasons, loan } = await service.checkEligibility(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      const availableCash = await service.availableCash(req.params.groupId);
      res.json({ eligible, reasons, available_cash: availableCash, requested_principal: loan.principal });
    } catch (err) { next(err); }
  }
);

// Check available fund cash (officers)
router.get(
  '/groups/:groupId/liquidity',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const available = await service.availableCash(req.params.groupId);
      res.json({ available_cash: available });
    } catch (err) {
      next(err);
    }
  }
);

// The lending decision — Owner only (not Treasurer). Sets the interest rate
// and, per TC-040, may approve LESS than the requested principal
// (approved_principal) when liquidity can't cover the full amount instead of
// only being able to block/reject. Does not disburse — see /disburse below.
router.post(
  '/groups/:groupId/loans/:id/approve',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const { interest_rate, approved_principal } = req.body;
      if (interest_rate == null) {
        return res.status(400).json({ error: 'interest_rate (monthly) is required to approve' });
      }
      const loan = await service.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      if (loan.membership_id === req.membership.id) {
        return res.status(403).json({ error: 'You cannot approve your own loan' });
      }
      const approvedLoan = await service.approveLoan({
        loanId: req.params.id,
        approverId: req.member.id,
        interestRate: interest_rate,
        approvedPrincipal: approved_principal,
      });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'approved', entityType: 'loan_decision', entityId: req.params.id,
        before: { status: loan.status, principal: loan.principal },
        after: { status: 'approved', approved_principal: approvedLoan.approved_principal, interest_rate },
      });
      res.json({ message: 'Loan approved — awaiting disbursement', loan: approvedLoan });
    } catch (err) {
      if (err.message && (err.message.includes('liquidity') || err.status === 409)) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Disburse an already-approved loan — Treasurer or Owner (TC-019).
router.post(
  '/groups/:groupId/loans/:id/disburse',
  requireAuth,
  requireGroupRole(['treasurer', 'owner']),
  async (req, res, next) => {
    try {
      const loan = await service.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      const ledgerEntry = await service.disburseLoan({
        loanId: req.params.id,
        disburserId: req.member.id,
      });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'disbursed', entityType: 'loan_disbursement', entityId: req.params.id,
        before: { status: loan.status }, after: { status: 'active', principal: loan.approved_principal ?? loan.principal },
      });
      res.json({ message: 'Loan disbursed', ledgerEntry });
    } catch (err) {
      if (err.message && err.message.includes('liquidity')) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Reject a pending loan, with a reason (owner only — mirrors the approve gate)
router.post(
  '/groups/:groupId/loans/:id/reject',
  requireAuth,
  requireGroupRole(['owner']),
  async (req, res, next) => {
    try {
      const loan = await service.rejectLoan(req.params.id, req.body?.reason);
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'rejected', entityType: 'loan_decision', entityId: req.params.id,
        before: { status: 'pending' }, after: { status: 'rejected', reason: req.body?.reason ?? null },
      });
      res.json({ message: 'Loan rejected', loan });
    } catch (err) {
      next(err);
    }
  }
);

// Borrower withdraws their own request — only while still 'pending'.
router.post(
  '/groups/:groupId/loans/:id/cancel',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const loan = await service.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      if (loan.membership_id !== req.membership.id) {
        return res.status(403).json({ error: 'You can only cancel your own loan request' });
      }
      const cancelled = await service.cancelLoan(req.params.id, req.membership.id);
      if (!cancelled) return res.status(409).json({ error: 'Only a pending request can be cancelled' });
      res.json({ message: 'Loan request cancelled', loan: cancelled });
    } catch (err) { next(err); }
  }
);

// Submit a repayment claim + proof — no money posts yet, a DIFFERENT officer
// confirms it later (see /repayments/:paymentId/confirm below). Either the
// borrower submitting their own claim, or an officer recording one on the
// borrower's behalf (cash/GCash received in person) — the latter is tagged
// is_walk_in so the app can tell them apart, same relationship as
// contributions' is_walk_in. Both go through the identical confirm step;
// there's no instant-post path anymore (see migration 0045 — the old
// record_loan_repayment RPC posted in one call with no real second-person
// check, same gap contributions' record_walkin_contribution had).
router.post(
  '/groups/:groupId/loans/:id/repayments/submit',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const { amount, payment_method, proof_url, external_reference } = req.body;
      if (amount == null) return res.status(400).json({ error: 'amount is required' });
      const loan = await service.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      const isOwnLoan = loan.membership_id === req.membership.id;
      const isOfficer = ['treasurer', 'auditor', 'owner'].includes(req.membership.role);
      if (!isOwnLoan && !isOfficer) {
        return res.status(403).json({ error: 'You can only submit a repayment for your own loan' });
      }
      const payment = await service.submitRepayment({
        loanId: req.params.id,
        amount,
        recordedBy: req.member.id,
        paymentMethod: payment_method,
        proofUrl: proof_url,
        externalReference: external_reference,
        isWalkIn: !isOwnLoan,
      });
      res.status(201).json({ message: 'Repayment submitted for confirmation', payment });
    } catch (err) { next(err); }
  }
);

// List repayments across the group's loans (officers see all / can filter by
// status; members see only their own) — the officer's "pending" queue and a
// member's own repayment history/status. NOT nested under /loans/:id — a
// path like /loans/repayments would collide with the /loans/:id route above
// (same segment shape, registered first, so "repayments" would be parsed as
// an :id) — kept at the group level instead, alongside /liquidity.
router.get(
  '/groups/:groupId/repayments',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const repayments = await service.listRepayments({
        groupId: req.params.groupId,
        membershipId: req.membership.id,
        role: req.membership.role,
        status: req.query.status,
      });
      res.json({ repayments });
    } catch (err) { next(err); }
  }
);

// Confirm a submitted repayment claim (officers) — must be a DIFFERENT
// officer than whoever submitted it (segregation of duties, enforced in SQL).
router.post(
  '/groups/:groupId/repayments/:paymentId/confirm',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const payment = await service.getRepayment(req.params.paymentId);
      if (payment.loans.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Repayment does not belong to this group' });
      }
      if (payment.recorded_by === req.member.id) {
        return res.status(403).json({ error: 'You cannot confirm a repayment you submitted' });
      }
      const ledgerEntry = await service.confirmRepayment({
        paymentId: req.params.paymentId,
        approverId: req.member.id,
      });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'confirmed', entityType: 'loan_payment', entityId: req.params.paymentId,
        before: { status: payment.status }, after: { status: 'paid', amount: payment.amount, recorded_by: payment.recorded_by },
      });
      res.json({ message: 'Repayment confirmed', ledgerEntry });
    } catch (err) {
      if (err.message && (err.message.includes('Approver cannot be') || err.message.includes('must be confirmed by the Auditor'))) {
        return res.status(403).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Reject a submitted repayment claim, with a reason (officers)
router.post(
  '/groups/:groupId/repayments/:paymentId/reject',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const payment = await service.getRepayment(req.params.paymentId);
      if (payment.loans.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Repayment does not belong to this group' });
      }
      const updated = await service.rejectRepayment({ paymentId: req.params.paymentId, reason: req.body?.reason });
      if (!updated) return res.status(409).json({ error: 'Repayment is not pending confirmation' });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'rejected', entityType: 'loan_payment', entityId: req.params.paymentId,
        before: { status: payment.status }, after: { status: 'rejected', reason: req.body?.reason ?? null },
      });
      res.json({ message: 'Repayment rejected', payment: updated });
    } catch (err) { next(err); }
  }
);

module.exports = router;
