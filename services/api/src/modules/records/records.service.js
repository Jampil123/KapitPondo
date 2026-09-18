const groupsService = require('../groups/groups.service');
const cyclesService = require('../cycles/cycles.service');
const contributionsService = require('../contributions/contributions.service');
const lendingService = require('../lending/lending.service');
const penaltiesService = require('../penalties/penalties.service');
const reportingService = require('../reporting/reporting.service');
const distributionsService = require('../distribution/distributions.service');

function sum(rows, key) {
  return (rows ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

// Picks the cycle a member's record should center on: the group's currently
// active one, else the most recently started one. listCycles() already
// orders by start_date desc, so [0] is "most recent" once 'active' isn't found.
function pickCycle(cycles) {
  if (!cycles?.length) return null;
  return cycles.find((c) => c.status === 'active') ?? cycles[0];
}

async function buildGroupRecord(membership) {
  const groupId = membership.groups.id;
  const membershipId = membership.id;

  const cycles = await cyclesService.listCycles(groupId);
  const cycle = pickCycle(cycles);

  const [cycleContributions, allContributions, loans, penalties, balance] = await Promise.all([
    cycle ? contributionsService.listContributions({ groupId, membershipId, role: 'member', cycleId: cycle.id }) : [],
    contributionsService.listContributions({ groupId, membershipId, role: 'member' }),
    lendingService.listLoans({ groupId, membershipId, role: 'member' }),
    penaltiesService.listPenalties({ groupId, membershipId }),
    reportingService.myBalance(membershipId),
  ]);

  // Repayments only exist for loans that reached at least 'approved' — no
  // point querying loan_payments for a still-pending or rejected request.
  const loansWithPayments = await Promise.all(
    loans.map(async (loan) => ({
      ...loan,
      payments: ['pending', 'rejected', 'cancelled'].includes(loan.status)
        ? []
        : await lendingService.getLoanPayments(loan.id),
    })),
  );

  let distribution = null;
  if (cycle) {
    const distributions = await distributionsService.listDistributions(groupId);
    const finalized = distributions.find((d) => d.cycle_id === cycle.id && d.status === 'finalized');
    if (finalized) {
      const allocations = await distributionsService.getAllocations(finalized.id, { role: 'member', membershipId });
      distribution = { ...finalized, allocation: allocations[0] ?? null };
    }
  }

  return {
    group: {
      name: membership.groups.name,
      fund_code: membership.groups.fund_code,
    },
    membership: {
      role: membership.role,
      status: membership.status,
      heads: membership.heads,
      joined_at: membership.joined_at,
    },
    cycle: cycle ? {
      name: cycle.name,
      status: cycle.status,
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      contribution_amount: cycle.contribution_amount,
      contribution_due_day: cycle.contribution_due_day,
      default_interest_rate: cycle.default_interest_rate,
    } : null,
    contributions: cycleContributions,
    contributionTotals: {
      total_paid: sum(allContributions.filter((c) => c.status === 'approved'), 'amount'),
      late_count: allContributions.filter((c) => c.is_late).length,
      penalty_applied: sum(allContributions, 'penalty_applied'),
    },
    loans: loansWithPayments,
    penaltyTotals: {
      charged: sum(penalties.filter((p) => p.status !== 'waived'), 'amount'),
      waived: sum(penalties.filter((p) => p.status === 'waived'), 'amount'),
    },
    ledgerSummary: {
      total_capital_contributed: balance.contributions,
      outstanding_loan_balance: balance.loan_outstanding,
    },
    distribution,
  };
}

async function buildMemberRecord(member) {
  const memberships = await groupsService.listMyGroups(member.id);
  const groups = await Promise.all(memberships.map(buildGroupRecord));

  return {
    member: {
      id: member.id,
      full_name: member.full_name,
      phone: member.phone,
      email: member.email,
      verification_status: member.verification_status,
      created_at: member.created_at,
    },
    generated_at: new Date().toISOString(),
    reference: `KP-REC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${member.id.slice(0, 8).toUpperCase()}`,
    groups,
  };
}

module.exports = { buildMemberRecord };
