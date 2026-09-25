// services/api/src/modules/loanAudits/loanAudits.service.js
// KapitPondo — Loan decision audits. For every loan that was approved,
// re-run the group's lending rules against the records AS THEY STOOD at the
// moment of approval (approved_at): was the borrower verified and a member,
// clear of unpaid penalties, without another open loan on that head; did the
// amount meet the cycle minimum and fit the fund's cash; was it decided by
// the right officer and not above what was asked. Nothing is snapshotted at
// approval, so this reconstructs from timestamps — read-only, for the Auditor
// (and Organizer) to review decisions, never to change them.

const supabase = require('../../config/supabase');
const { withSubjects } = require('../../lib/auditSubjects');

const LOAN_SELECT = '*, approver:members!approved_by(id, full_name), disburser:members!disbursed_by(full_name), disbursed_entry:ledger_entries!disbursed_ledger_entry_id(entry_no), membership:memberships!membership_id(id, member_id, role, joined_at, members!member_id(full_name, verification_status, verified_at))';
const PAGE = 1000;

function loanRef(no) {
  return `LN-${String(no ?? 0).padStart(4, '0')}`;
}

function peso(n) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function monthYear(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

// PostgREST caps a request at 1000 rows — page through so the cash check
// never silently works from a partial ledger.
async function allRows(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function loadGroup(groupId, onlyLoanId) {
  let loansQ = supabase.from('loans').select(LOAN_SELECT).eq('group_id', groupId).not('approved_at', 'is', null).order('approved_at', { ascending: false });
  if (onlyLoanId) loansQ = loansQ.eq('id', onlyLoanId);

  const [loansRes, allLoansRes, penaltiesRes, cyclesRes, decisionsRes, paymentsRes, ledger] = await Promise.all([
    loansQ,
    supabase.from('loans').select('id, loan_no, membership_id, head_no, status, applied_at, approved_at, disbursed_at').eq('group_id', groupId),
    supabase.from('penalties').select('membership_id, status, created_at, updated_at, waived_at, ledger_entry:ledger_entries!ledger_entry_id(posted_at), contribution:contributions!contribution_id(due_date)').eq('group_id', groupId),
    supabase.from('cycles').select('id, start_date, end_date, minimum_loan_amount, created_at').eq('group_id', groupId),
    supabase.from('audit_log').select('entity_id, actor_role, created_at, after_data').eq('group_id', groupId).eq('entity_type', 'loan_decision').eq('action', 'approved'),
    supabase.from('loan_payments').select('loan_id, status, created_at, loans!inner(group_id)').eq('loans.group_id', groupId).eq('status', 'paid'),
    allRows(() => supabase.from('ledger_entries').select('amount, direction, posted_at').eq('group_id', groupId).order('posted_at', { ascending: true })),
  ]);
  for (const r of [loansRes, allLoansRes, penaltiesRes, cyclesRes, decisionsRes, paymentsRes]) if (r.error) throw r.error;

  return {
    loans: loansRes.data,
    allLoans: allLoansRes.data,
    penalties: penaltiesRes.data,
    cycles: cyclesRes.data,
    decisions: decisionsRes.data,
    payments: paymentsRes.data,
    ledger,
  };
}

function cashAt(ledger, t) {
  let cash = 0;
  for (const e of ledger) {
    if (e.posted_at > t) break;
    cash += (e.direction === 'credit' ? 1 : -1) * Number(e.amount);
  }
  return cash;
}

// When a penalty stopped being owed: waived, paid (its ledger posting), or — for
// a non-pending one with neither recorded — its last update.
function penaltyResolvedAt(p) {
  return p.waived_at ?? p.ledger_entry?.posted_at ?? (p.status !== 'pending' ? p.updated_at : null);
}

function cycleAt(cycles, t) {
  const d = t.slice(0, 10);
  const running = cycles.filter((c) => c.start_date <= d && (!c.end_date || c.end_date >= d));
  const pool = running.length ? running : cycles.filter((c) => c.created_at <= t);
  return pool.sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] ?? null;
}

function auditLoan(loan, ctx) {
  const t = loan.approved_at;
  const borrower = loan.membership?.members;
  const approved = Number(loan.approved_principal ?? loan.principal);
  const requested = Number(loan.principal);
  const checks = [];
  const add = (key, label, passed, detail) => checks.push({ key, label, passed, detail });

  // 1. Verified account
  const verifiedBy = borrower?.verification_status === 'verified' && (!borrower.verified_at || borrower.verified_at <= t);
  add('verified', 'Account is verified', verifiedBy,
    verifiedBy ? (borrower.verified_at ? `Verified on ${day(borrower.verified_at)}` : 'Verified') : 'Not verified when approved');

  // 2. Active member
  const joined = loan.membership?.joined_at;
  const member = !joined || joined <= t;
  add('member', 'Active member of the group', member, member ? (joined ? `Member since ${monthYear(joined)}` : 'Member') : `Joined ${day(joined)}, after approval`);

  // 3. No unpaid late penalties
  const owing = ctx.penalties.filter((p) => p.membership_id === loan.membership_id && p.created_at <= t && (() => {
    const r = penaltyResolvedAt(p);
    return !r || r > t;
  })());
  // Name the oldest miss: "August contribution was still unsettled 12 days after the due date".
  const oldest = owing.map((p) => p.contribution?.due_date).filter(Boolean).sort()[0];
  const lateBy = oldest ? Math.floor((new Date(t) - new Date(`${oldest}T00:00:00`)) / 86400000) : null;
  add('penalties', 'No missed contributions', owing.length === 0,
    owing.length === 0 ? 'All due contributions settled'
      : oldest ? `${new Date(`${oldest}T00:00:00`).toLocaleDateString('en-PH', { month: 'long' })} contribution was still unsettled ${lateBy} day${lateBy === 1 ? '' : 's'} after the due date${owing.length > 1 ? ` (+${owing.length - 1} more)` : ''}`
        : `${owing.length} unpaid late penalt${owing.length === 1 ? 'y' : 'ies'}`);

  // 4. No other open loan on the same head
  const lastPaid = (loanId) => ctx.payments.filter((p) => p.loan_id === loanId).reduce((m, p) => (p.created_at > m ? p.created_at : m), '');
  const openOther = ctx.allLoans.find((o) => o.id !== loan.id && o.membership_id === loan.membership_id && o.head_no === loan.head_no
    && o.disbursed_at && o.disbursed_at <= t
    && (o.status === 'active' || o.status === 'defaulted' || (o.status === 'paid' && lastPaid(o.id) > t)));
  add('open_loan', 'No active unpaid loan', !openOther, openOther ? `${loanRef(openOther.loan_no)} was still unpaid` : 'No open loans');

  // 5. Cycle minimum
  const min = cycleAt(ctx.cycles, t)?.minimum_loan_amount;
  const meetsMin = min == null || approved >= Number(min);
  add('minimum', 'Amount meets the minimum', meetsMin, min == null ? 'No minimum set' : meetsMin ? `Minimum is ${peso(min)}` : `Below the ${peso(min)} minimum`);

  // 6. Fund cash
  const cash = cashAt(ctx.ledger, t);
  add('cash', 'Enough cash in the fund', cash >= approved, `${peso(cash)} in the fund at approval`);

  // 7. Right officer, not the borrower
  const decision = ctx.decisions.filter((d) => d.entity_id === loan.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const selfApproved = !!loan.approver?.id && loan.approver.id === loan.membership?.member_id;
  const borrowerIsOwner = loan.membership?.role === 'owner';
  const expectedRole = borrowerIsOwner ? 'treasurer' : 'owner';
  const wrongRole = !!decision?.actor_role && decision.actor_role !== expectedRole;
  const roleName = (r) => (r === 'owner' ? 'Organizer' : r === 'treasurer' ? 'Treasurer' : r);
  add('decider', 'Decided by the right officer', !selfApproved && !wrongRole,
    selfApproved ? 'Approved by the borrower'
      : wrongRole ? `Decided by the ${roleName(decision.actor_role)} instead of the ${roleName(expectedRole)}`
        : `${roleName(expectedRole)} decided, not the borrower`);

  // 8. Not above the request
  add('within_request', 'Approved within the request', approved <= requested,
    approved < requested ? `${peso(approved)} of ${peso(requested)} asked` : approved === requested ? 'Full amount asked' : `${peso(approved)}, more than the ${peso(requested)} asked`);

  const failed = checks.filter((c) => !c.passed).length;
  return {
    loan_id: loan.id,
    ref: loanRef(loan.loan_no),
    borrower: borrower?.full_name ?? null,
    head_no: loan.head_no,
    head_name: loan.head_name ?? null,
    purpose: loan.purpose,
    principal: loan.principal,
    approved_principal: loan.approved_principal,
    interest_rate: loan.interest_rate,
    term_months: loan.term_months,
    status: loan.status,
    approved_at: loan.approved_at,
    approver: loan.approver?.full_name ?? null,
    decided_as: decision?.actor_role ?? null,
    disbursed_at: loan.disbursed_at,
    disburser: loan.disburser?.full_name ?? null,
    released_entry_ref: loan.disbursed_entry?.entry_no ? `LE-${1000 + loan.disbursed_entry.entry_no}` : null,
    partial: approved < requested,
    failed,
    checks,
  };
}

async function listLoanAudits({ groupId }) {
  const ctx = await loadGroup(groupId);
  return ctx.loans.map((l) => auditLoan(l, ctx));
}

async function getLoanAudit({ groupId, loanId }) {
  const ctx = await loadGroup(groupId, loanId);
  const loan = ctx.loans[0];
  if (!loan) return null;
  const audit = auditLoan(loan, ctx);

  const { data: history, error } = await supabase
    .from('audit_log')
    .select('*, actor:members!actor_id(full_name)')
    .eq('group_id', groupId)
    .eq('entity_id', loanId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return { ...audit, history: await withSubjects(history) };
}

module.exports = { loanRef, listLoanAudits, getLoanAudit };
