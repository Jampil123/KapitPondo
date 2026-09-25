// services/api/src/modules/lending/lending.routes.js
// KapitPondo — Lending routes (FINAL)
// Mount in app.js:  app.use('/api', require('./modules/lending/lending.routes'));

const express = require('express');
const router = express.Router();
const requireAuth = require('../../middleware/auth');
const requireGroupRole = require('../../middleware/requireGroupRole');
const service = require('./lending.service');
const { logAudit } = require('../../lib/auditLog');
const { notify } = require('../../lib/notifications');
const officers = require('../../lib/officers');
const flags = require('../flags/flags.service');
const { readProofInBackground, readAndSaveProof } = require('../../lib/proofReading');
const supabase = require('../../config/supabase');

// SQL step checks (migration 0075) raise these when the wrong person tries a step.
const STEP_ERRORS = ['must be decided by', 'must be reviewed by', 'must be released by', 'must be verified by', 'must be confirmed by',
  'You cannot', 'cannot also', 'Approver cannot be', 'needs its before-release review'];
const stepError = (err) => err.message && STEP_ERRORS.some((m) => err.message.includes(m));

const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

async function borrowerOf(membershipId) {
  const { data, error } = await supabase.from('memberships').select('member_id, role').eq('id', membershipId).single();
  if (error) throw error;
  return data;
}

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
      const { principal, term_months, purpose, head_no } = req.body;
      if (principal == null || term_months == null) {
        return res.status(400).json({ error: 'principal and term_months are required' });
      }
      const loan = await service.applyForLoan({
        membershipId: req.membership.id,
        groupId: req.params.groupId,
        principal,
        termMonths: term_months,
        purpose,
        headNo: head_no,
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
      const { heads, slots } = await service.headSlots(req.membership.id);
      res.json({ eligible, reasons, available_cash: availableCash, heads, slots });
    } catch (err) { next(err); }
  }
);

// Member-safe "who's borrowing" list — name, head, amount, status only.
// Registered before /loans/:id for the same reason as /eligibility above.
router.get(
  '/groups/:groupId/loans/borrowers',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const borrowers = await service.listBorrowers(req.params.groupId);
      res.json({ borrowers });
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

// The lending decision — Owner only, EXCEPT when the Owner themselves is the
// borrower: an Owner can't approve their own loan (see the self-check
// below), and until now nothing else was allowed through this route at all,
// so an Owner's own request could never be decided by anyone. When the
// loan's borrower is the Owner, the Treasurer is authorized to decide it
// instead — for every other borrower, this stays Owner-only exactly as
// before. Sets the interest rate and, per TC-040, may approve LESS than the
// requested principal (approved_principal) when liquidity can't cover the
// full amount instead of only being able to block/reject. Does not
// disburse — see /disburse below.
router.post(
  '/groups/:groupId/loans/:id/approve',
  requireAuth,
  requireGroupRole(['owner', 'treasurer']),
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
        return res.status(403).json({ error: 'You cannot approve your own loan — the Treasurer reviews it instead' });
      }
      const borrowerIsOwner = loan.membership?.role === 'owner';
      if (borrowerIsOwner && req.membership.role !== 'treasurer') {
        return res.status(403).json({ error: 'The Organizer cannot approve their own loan — the Treasurer reviews it instead' });
      }
      if (!borrowerIsOwner && req.membership.role !== 'owner') {
        return res.status(403).json({ error: 'Only the Organizer can decide on this loan' });
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
      const borrowerRole = loan.membership?.role;
      const skip = [loan.membership?.member_id, req.member.id].filter(Boolean);
      if (approvedLoan.review_required) {
        await officers.notifyRole({ groupId: req.params.groupId, role: officers.LOAN_DUTY.review(borrowerRole), skip, type: 'loan.to_review', title: 'Loan to review before release', message: `An officer's loan of ${peso(approvedLoan.approved_principal)} needs your review before it can be released.` });
      } else {
        await officers.notifyRole({ groupId: req.params.groupId, role: officers.LOAN_DUTY.release(borrowerRole), skip, type: 'loan.to_release', title: 'Loan ready to release', message: `A loan of ${peso(approvedLoan.approved_principal)} was approved and is ready to release.` });
      }
      res.json({ message: approvedLoan.review_required ? 'Loan approved — waiting for review before release' : 'Loan approved — ready to release', loan: approvedLoan });
    } catch (err) {
      if (err.message && (err.message.includes('liquidity') || err.status === 409)) {
        return res.status(409).json({ error: err.message });
      }
      if (stepError(err)) return res.status(403).json({ error: err.message });
      next(err);
    }
  }
);

// Before-release review of an officer's loan — the Auditor, or the Treasurer
// when the Auditor borrows. { cleared: true } unlocks the release;
// { cleared: false, note } sends it back to pending.
router.post(
  '/groups/:groupId/loans/:id/review',
  requireAuth,
  requireGroupRole(['auditor', 'treasurer', 'owner']),
  async (req, res, next) => {
    try {
      const { cleared, note } = req.body ?? {};
      if (typeof cleared !== 'boolean') return res.status(400).json({ error: 'cleared (true/false) is required' });
      const loan = await service.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      const reviewed = await service.reviewLoan({ loanId: req.params.id, reviewerId: req.member.id, cleared, note });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: cleared ? 'reviewed' : 'sent_back', entityType: 'loan_decision', entityId: req.params.id,
        before: { status: 'approved' }, after: { status: cleared ? 'cleared' : 'pending', note: note ?? null },
      });
      const skip = [loan.membership?.member_id, req.member.id].filter(Boolean);
      if (cleared) {
        await officers.notifyRole({ groupId: req.params.groupId, role: officers.LOAN_DUTY.release(loan.membership?.role), skip, type: 'loan.to_release', title: 'Loan cleared for release', message: `A loan of ${peso(loan.approved_principal ?? loan.principal)} passed its review and is ready to release.` });
      } else if (loan.approved_by) {
        await notify({ memberId: loan.approved_by, groupId: req.params.groupId, type: 'loan.sent_back', title: 'Loan sent back', message: `A loan you approved was sent back at review: ${note}` });
      }
      res.json({ message: cleared ? 'Loan cleared for release' : 'Loan sent back to the approver', loan: reviewed });
    } catch (err) {
      if (stepError(err) || (err.message && (err.message.includes('not waiting for review') || err.message.includes('Say why')))) {
        return res.status(err.message.includes('Say why') ? 400 : 403).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Release an approved loan — the cash goes out, the ledger posting waits for
// the release to be verified. The Treasurer releases, or the Organizer when
// the Treasurer is the borrower (disburse_loan() checks which).
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
      await service.disburseLoan({ loanId: req.params.id, disburserId: req.member.id });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'disbursed', entityType: 'loan_disbursement', entityId: req.params.id,
        before: { status: loan.status }, after: { status: 'active', principal: loan.approved_principal ?? loan.principal, posted: false },
      });
      await officers.notifyRole({
        groupId: req.params.groupId, role: officers.LOAN_DUTY.verify(loan.membership?.role),
        skip: [loan.membership?.member_id, req.member.id].filter(Boolean),
        type: 'loan.release_to_verify', title: 'Loan release to verify',
        message: `A loan release of ${peso(loan.approved_principal ?? loan.principal)} is waiting for your verification.`,
      });
      res.json({ message: 'Loan released — waiting for verification before it posts' });
    } catch (err) {
      if (err.message && err.message.includes('liquidity')) {
        return res.status(409).json({ error: err.message });
      }
      if (stepError(err)) return res.status(403).json({ error: err.message });
      next(err);
    }
  }
);

// Verify a loan release — this posts the disbursement. The Auditor, or the
// Organizer when the Auditor borrows.
router.post(
  '/groups/:groupId/loans/:id/verify-release',
  requireAuth,
  requireGroupRole(['auditor', 'owner']),
  async (req, res, next) => {
    try {
      const loan = await service.getLoan(req.params.id);
      if (loan.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      const ledgerEntry = await service.verifyLoanRelease({ loanId: req.params.id, verifierId: req.member.id });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'verified', entityType: 'loan_disbursement', entityId: req.params.id,
        before: { posted: false }, after: { posted: true, principal: loan.approved_principal ?? loan.principal, released_by: loan.disbursed_by },
      });
      res.json({ message: 'Loan release verified and posted', ledgerEntry });
    } catch (err) {
      if (stepError(err) || (err.message && err.message.includes('not waiting for verification'))) {
        return res.status(403).json({ error: err.message });
      }
      next(err);
    }
  }
);

// Reject a pending loan, with a reason — mirrors the approve gate: Owner
// only, except the Treasurer decides when the Owner is the borrower.
router.post(
  '/groups/:groupId/loans/:id/reject',
  requireAuth,
  requireGroupRole(['owner', 'treasurer']),
  async (req, res, next) => {
    try {
      const target = await service.getLoan(req.params.id);
      if (target.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Loan does not belong to this group' });
      }
      if (target.membership_id === req.membership.id) {
        return res.status(403).json({ error: 'You cannot reject your own loan — the Treasurer reviews it instead' });
      }
      const borrowerIsOwner = target.membership?.role === 'owner';
      if (borrowerIsOwner && req.membership.role !== 'treasurer') {
        return res.status(403).json({ error: 'The Organizer cannot decide on their own loan — the Treasurer reviews it instead' });
      }
      if (!borrowerIsOwner && req.membership.role !== 'owner') {
        return res.status(403).json({ error: 'Only the Organizer can decide on this loan' });
      }
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
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'recorded', entityType: 'loan_payment', entityId: payment.id,
        before: null, after: { status: 'submitted', amount: payment.amount, walk_in: !isOwnLoan },
      });
      if (payment.proof_url) readProofInBackground('loan_payments', payment.id);
      let saved = payment;
      const borrower = await borrowerOf(loan.membership_id);
      if (!isOwnLoan) {
        saved = await service.recordWalkInRepayment({ paymentId: payment.id, recorderId: req.member.id });
        if (saved.status === 'confirmed') {
          await logAudit({
            groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
            action: 'confirmed', entityType: 'loan_payment', entityId: payment.id,
            before: { status: 'submitted' }, after: { status: 'confirmed', amount: payment.amount, walk_in: true },
          });
        }
        await notify({
          memberId: borrower.member_id, groupId: req.params.groupId,
          type: 'loan.walk_in_recorded', title: 'Repayment recorded',
          message: `${req.member.full_name ?? 'An officer'} recorded a ${peso(payment.amount)} repayment from you on ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}. Tap if this isn't right.`,
        });
      }
      await nudgeRepayment({ groupId: req.params.groupId, payment: saved, borrower });
      res.status(201).json({ message: saved.status === 'confirmed' ? 'Repayment recorded — waiting for verification' : 'Repayment submitted for confirmation', payment: saved });
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

// Member-safe pre-submit check: is this reference number already attached to
// another repayment in this group? Mirrors contributions' identical
// /contributions/check-reference route — used by the loan-repayment GCash
// sheet's OCR validation the same way contributions' does.
router.get(
  '/groups/:groupId/repayments/check-reference',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const ref = req.query.ref;
      if (!ref || typeof ref !== 'string') {
        return res.status(400).json({ error: 'ref is required' });
      }
      const duplicate = await service.hasDuplicateExternalReference(req.params.groupId, ref);
      res.json({ duplicate });
    } catch (err) { next(err); }
  }
);

// The server's reading of a repayment's proof (0076) — on demand, for older records.
router.post(
  '/groups/:groupId/repayments/:paymentId/read-proof',
  requireAuth,
  requireGroupRole(['treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const payment = await service.getRepayment(req.params.paymentId);
      if (payment.loans.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Repayment does not belong to this group' });
      }
      const reading = await readAndSaveProof('loan_payments', payment.id);
      res.json({ reading });
    } catch (err) { next(err); }
  }
);

// Whoever's step it is now hears about it.
async function nudgeRepayment({ groupId, payment, borrower }) {
  const skip = [borrower.member_id, payment.recorded_by, payment.confirmed_by].filter(Boolean);
  if (payment.status === 'submitted') {
    await officers.notifyRole({ groupId, role: officers.confirmRole(borrower.role), skip, type: 'loan.repayment_to_confirm', title: 'Repayment to confirm', message: 'A loan repayment is waiting for you to confirm the money arrived.' });
  } else if (payment.status === 'confirmed') {
    const recorderRole = payment.recorded_by ? await officers.roleOf(groupId, payment.recorded_by) : null;
    await officers.notifyRole({ groupId, role: await officers.verifyRole(groupId, borrower.role, recorderRole), skip, type: 'loan.repayment_to_verify', title: 'Repayment to verify', message: 'A confirmed loan repayment is waiting for your verification.' });
  }
}

function repaymentStep(pick) {
  return async (req, res, next) => {
    try {
      const payment = await service.getRepayment(req.params.paymentId);
      if (payment.loans.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Repayment does not belong to this group' });
      }
      const step = pick(payment.status);
      if (!step) return res.status(409).json({ error: 'Repayment is not waiting for this step' });
      const borrower = await borrowerOf(payment.loans.membership_id);

      if (step === 'confirm') {
        const saved = await service.confirmRepayment({ paymentId: payment.id, confirmerId: req.member.id });
        await logAudit({
          groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
          action: 'confirmed', entityType: 'loan_payment', entityId: payment.id,
          before: { status: payment.status }, after: { status: 'confirmed', amount: payment.amount, recorded_by: payment.recorded_by },
        });
        await nudgeRepayment({ groupId: req.params.groupId, payment: saved, borrower });
        return res.json({ message: 'Repayment confirmed — waiting for verification', payment: saved });
      }

      const ledgerEntry = await service.verifyRepayment({ paymentId: payment.id, verifierId: req.member.id });
      await logAudit({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        action: 'verified', entityType: 'loan_payment', entityId: payment.id,
        before: { status: payment.status }, after: { status: 'paid', amount: payment.amount, recorded_by: payment.recorded_by, confirmed_by: payment.confirmed_by },
      });
      res.json({ message: 'Repayment verified and posted', ledgerEntry });
    } catch (err) {
      if (stepError(err)) return res.status(403).json({ error: err.message });
      next(err);
    }
  };
}

const officerOnly = requireGroupRole(['treasurer', 'auditor', 'owner']);

// Step 1 — confirm the money arrived (Treasurer; Organizer for the Treasurer's own loan).
router.post('/groups/:groupId/repayments/:paymentId/confirm-receipt', requireAuth, officerOnly,
  repaymentStep((status) => (status === 'submitted' ? 'confirm' : null)));

// Step 2 — verify and post (Auditor; Organizer for the Auditor's own loan).
router.post('/groups/:groupId/repayments/:paymentId/verify', requireAuth, officerOnly,
  repaymentStep((status) => (status === 'confirmed' ? 'verify' : null)));

// Older clients: "confirm" does whichever step is next.
router.post('/groups/:groupId/repayments/:paymentId/confirm', requireAuth, officerOnly,
  repaymentStep((status) => (status === 'submitted' ? 'confirm' : status === 'confirmed' ? 'verify' : null)));

// The borrower's "This isn't right" on a repayment recorded for them — raises
// a flag the Auditor sees; blocks nothing.
router.post(
  '/groups/:groupId/repayments/:paymentId/dispute',
  requireAuth,
  requireGroupRole(['member', 'treasurer', 'auditor', 'owner']),
  async (req, res, next) => {
    try {
      const payment = await service.getRepayment(req.params.paymentId);
      if (payment.loans.group_id !== req.params.groupId) {
        return res.status(400).json({ error: 'Repayment does not belong to this group' });
      }
      if (payment.loans.membership_id !== req.membership.id) {
        return res.status(403).json({ error: 'You can only dispute a repayment recorded for you' });
      }
      if (await flags.hasOpenFlag({ entityId: payment.id, raisedBy: req.member.id })) {
        return res.status(409).json({ error: "You've already reported this one — the Auditor is looking into it" });
      }
      const flag = await flags.raiseFlag({
        groupId: req.params.groupId, actorId: req.member.id, actorRole: req.membership.role,
        entityType: 'loan_payment', entityId: payment.id,
        reason: "Member says this isn't right", note: req.body?.note?.trim() || null,
        label: `${req.member.full_name ?? 'A member'}'s repayment`,
      });
      await officers.notifyRole({
        groupId: req.params.groupId, role: 'auditor', skip: [req.member.id],
        type: 'audit.flagged', title: 'A member disputed a repayment',
        message: `${req.member.full_name ?? 'A member'} says a repayment recorded for them isn't right.`,
      });
      res.status(201).json({ message: 'Thanks — the Auditor will look into it', flag });
    } catch (err) { next(err); }
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
      if (!updated) return res.status(409).json({ error: 'Repayment is not waiting for confirmation or verification' });
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
