// services/api/src/modules/reporting/reporting.service.js
// KapitPondo — Reporting service (M8, FINAL). Read-only.

const supabase = require('../../config/supabase');

// Group-wide financial snapshot (officers)
async function groupSummary(groupId) {
  const { data, error } = await supabase.rpc('group_summary', { p_group_id: groupId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Member-safe fund aggregate — same RPC/fields as groupSummary (already
// aggregate-only: totals + available_cash + counts, no per-member breakdown),
// kept as its own function so the officer-only groupSummary can grow
// officer-sensitive fields later without automatically exposing them here.
async function fundSummary(groupId) {
  const { data, error } = await supabase.rpc('group_summary', { p_group_id: groupId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// A single membership's net balance
async function membershipBalance(membershipId) {
  const { data, error } = await supabase.rpc('membership_balance', {
    p_membership_id: membershipId,
  });
  if (error) throw error;
  return data;
}

// The caller's own balance breakdown — membership_balance() only returns the
// net figure, but the client shows contributions/loan_outstanding separately,
// so compute those directly rather than fabricating them.
async function myBalance(membershipId) {
  const [contribRes, loanRes, balance] = await Promise.all([
    supabase.from('ledger_entries').select('amount').eq('membership_id', membershipId).eq('entry_type', 'contribution'),
    supabase.from('loans').select('outstanding_balance').eq('membership_id', membershipId).eq('status', 'active'),
    membershipBalance(membershipId),
  ]);
  if (contribRes.error) throw contribRes.error;
  if (loanRes.error) throw loanRes.error;
  const contributions = (contribRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const loan_outstanding = (loanRes.data ?? []).reduce((sum, r) => sum + Number(r.outstanding_balance), 0);
  return { contributions, loan_outstanding, balance };
}

// The ledger feed for a group, with optional filters
async function groupLedger({ groupId, membershipId, entryType, limit = 100 }) {
  let q = supabase
    .from('ledger_entries')
    // posted_by is always the approving officer (see approve_contribution /
    // approve_and_disburse_loan / record_loan_repayment RPCs) — joined so the
    // member-facing activity feed can show "approved by {name}". membership
    // is who the entry actually belongs to (the contributor/borrower) — null
    // for group-level entries like expenses — joined so officer dashboards
    // can show whose transaction this is, not just who approved it.
    .select('*, poster:members!posted_by(full_name), membership:memberships!membership_id(member_id, members!member_id(full_name, avatar_url))')
    .eq('group_id', groupId)
    .order('posted_at', { ascending: false })
    .limit(limit);
  if (membershipId) q = q.eq('membership_id', membershipId);
  if (entryType) q = q.eq('entry_type', entryType);
  const { data, error } = await q;
  if (error) throw error;
  return attachConfirmers(data);
}

const MANILA_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' });

// Members' view of the group ledger: totals only — per entry type and per
// month — with no per-entry rows, so no member names or individual amounts.
async function fundTotals(groupId) {
  const PAGE = 1000; // PostgREST's per-request row cap
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('entry_type, direction, amount, posted_at')
      .eq('group_id', groupId)
      .order('posted_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const byType = {};
  const months = new Map();
  for (const r of rows) {
    const amount = Number(r.amount);
    const credit = r.direction === 'credit';
    byType[r.entry_type] = (byType[r.entry_type] ?? 0) + (credit ? amount : -amount);
    const key = MANILA_MONTH.format(new Date(r.posted_at)); // "2026-09"
    const m = months.get(key) ?? { month: key, money_in: 0, money_out: 0, postings: 0 };
    if (credit) m.money_in += amount; else m.money_out += amount;
    m.postings += 1;
    months.set(key, m);
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    postings: rows.length,
    by_type: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, round(v)])),
    by_month: [...months.values()]
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .map((m) => ({ ...m, money_in: round(m.money_in), money_out: round(m.money_out) })),
  };
}

// The first of the two sign-offs lives on the source record, not the ledger
// row (posted_by is the verifier). Attaches `confirmer` — who confirmed the
// money arrived, or released the loan or withdrawal payout — so each entry
// shows both names.
async function attachConfirmers(entries) {
  const idsOf = (type) => [...new Set(entries.filter((e) => e.source_type === type && e.source_id).map((e) => e.source_id))];
  const fetchRows = async (table, cols, ids) => {
    if (!ids.length) return [];
    const { data, error } = await supabase.from(table).select(cols).in('id', ids);
    if (error) throw error;
    return data;
  };

  const [contribs, repayments, loans, penalties, withdrawals] = await Promise.all([
    fetchRows('contributions', 'id, confirmed_by', idsOf('contribution')),
    fetchRows('loan_payments', 'id, confirmed_by', idsOf('loan_payment')),
    fetchRows('loans', 'id, disbursed_by', idsOf('loan')),
    fetchRows('penalties', 'id, paid_with_contribution_id', idsOf('penalty')),
    fetchRows('withdrawals', 'id, released_by', idsOf('withdrawal')),
  ]);
  // A penalty is settled with the contribution that covered it, so it shares that contribution's confirmer.
  const penaltyContribs = await fetchRows('contributions', 'id, confirmed_by',
    [...new Set(penalties.map((p) => p.paid_with_contribution_id).filter(Boolean))]);
  const contribConfirmer = new Map([...contribs, ...penaltyContribs].map((c) => [c.id, c.confirmed_by]));

  const confirmerIdBySource = new Map([
    ...contribs.map((c) => [`contribution:${c.id}`, c.confirmed_by]),
    ...repayments.map((p) => [`loan_payment:${p.id}`, p.confirmed_by]),
    ...loans.map((l) => [`loan:${l.id}`, l.disbursed_by]),
    ...withdrawals.map((w) => [`withdrawal:${w.id}`, w.released_by]),
    ...penalties.map((p) => [`penalty:${p.id}`, contribConfirmer.get(p.paid_with_contribution_id) ?? null]),
  ]);
  const memberIds = [...new Set([...confirmerIdBySource.values()].filter(Boolean))];
  const members = await fetchRows('members', 'id, full_name', memberIds);
  const nameById = new Map(members.map((m) => [m.id, m.full_name]));

  return entries.map((e) => {
    const id = confirmerIdBySource.get(`${e.source_type}:${e.source_id}`);
    return { ...e, confirmer: id && nameById.has(id) ? { id, full_name: nameById.get(id) } : null };
  });
}

// Per-member balances across a group (officers) — one row per active membership
async function memberBalances(groupId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, heads, role, status, members!member_id(full_name, avatar_url)')
    .eq('group_id', groupId)
    .eq('status', 'active');
  if (error) throw error;

  // Attach each member's net balance
  const results = [];
  for (const m of data) {
    const balance = await membershipBalance(m.id);
    results.push({
      membership_id: m.id,
      full_name: m.members?.full_name,
      avatar_url: m.members?.avatar_url ?? null,
      role: m.role,
      heads: m.heads,
      balance,
    });
  }
  return results;
}

// Every row of a query, past PostgREST's 1000-row cap. `build` makes a fresh query each page.
async function fetchAll(build) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// Officers' financial report for [from, to) (ISO timestamps): cash at the
// start and end, money in and out by type, loans, penalties, and each
// member's position today.
async function financialReport(groupId, { from, to }) {
  const round = (n) => Math.round(n * 100) / 100;
  const signed = (r) => (r.direction === 'credit' ? 1 : -1) * Number(r.amount);

  const [ledger, loans, payments, penalties, memberships] = await Promise.all([
    fetchAll(() => supabase.from('ledger_entries').select('entry_type, direction, amount, posted_at, membership_id')
      .eq('group_id', groupId).lt('posted_at', to).order('posted_at')),
    fetchAll(() => supabase.from('loans')
      .select('id, membership_id, status, principal, approved_principal, outstanding_balance, disbursed_at, disbursed_ledger_entry_id')
      .eq('group_id', groupId)),
    fetchAll(() => supabase.from('loan_payments').select('amount, principal_portion, interest_portion, paid_date, status, loans!inner(group_id)')
      .eq('loans.group_id', groupId).in('status', ['paid', 'approved'])),
    fetchAll(() => supabase.from('penalties').select('membership_id, amount, status, created_at, waived_at, updated_at').eq('group_id', groupId)),
    fetchAll(() => supabase.from('memberships').select('id, role, status, heads, members!member_id(full_name)')
      .eq('group_id', groupId).in('status', ['active', 'suspended'])),
  ]);

  const inPeriod = (iso) => iso && iso >= from && iso < to;
  const fromDay = from.slice(0, 10);
  const toDay = to.slice(0, 10);

  // Cash: the ledger balance before and at the end of the period.
  const opening = ledger.filter((r) => r.posted_at < from).reduce((s, r) => s + signed(r), 0);
  const periodRows = ledger.filter((r) => r.posted_at >= from);
  const moneyIn = {};
  const moneyOut = {};
  for (const r of periodRows) {
    const bucket = r.direction === 'credit' ? moneyIn : moneyOut;
    bucket[r.entry_type] = (bucket[r.entry_type] ?? 0) + Number(r.amount);
  }
  const totalIn = Object.values(moneyIn).reduce((s, v) => s + v, 0);
  const totalOut = Object.values(moneyOut).reduce((s, v) => s + v, 0);

  const paidInPeriod = payments.filter((p) => p.paid_date && p.paid_date >= fromDay && p.paid_date < toDay);
  const activeLoans = loans.filter((l) => l.status === 'active');

  const contributedBy = new Map();
  for (const r of ledger) {
    if (r.entry_type === 'contribution' && r.direction === 'credit' && r.membership_id) {
      contributedBy.set(r.membership_id, (contributedBy.get(r.membership_id) ?? 0) + Number(r.amount));
    }
  }

  return {
    period: { from, to },
    cash: { opening: round(opening), money_in: round(totalIn), money_out: round(totalOut), closing: round(opening + totalIn - totalOut) },
    money_in: Object.fromEntries(Object.entries(moneyIn).map(([k, v]) => [k, round(v)])),
    money_out: Object.fromEntries(Object.entries(moneyOut).map(([k, v]) => [k, round(v)])),
    loans: {
      released: round(loans.filter((l) => l.disbursed_ledger_entry_id && inPeriod(l.disbursed_at))
        .reduce((s, l) => s + Number(l.approved_principal ?? l.principal), 0)),
      principal_repaid: round(paidInPeriod.reduce((s, p) => s + Number(p.principal_portion), 0)),
      interest_earned: round(paidInPeriod.reduce((s, p) => s + Number(p.interest_portion), 0)),
      active_count: activeLoans.length,
      outstanding: round(activeLoans.reduce((s, l) => s + Number(l.outstanding_balance), 0)),
    },
    penalties: {
      charged: round(penalties.filter((p) => inPeriod(p.created_at)).reduce((s, p) => s + Number(p.amount), 0)),
      paid: round(penalties.filter((p) => p.status === 'paid' && inPeriod(p.updated_at)).reduce((s, p) => s + Number(p.amount), 0)),
      waived: round(penalties.filter((p) => p.status === 'waived' && inPeriod(p.waived_at)).reduce((s, p) => s + Number(p.amount), 0)),
      pending: round(penalties.filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0)),
    },
    members: memberships.map((m) => ({
      name: m.members?.full_name ?? 'Member',
      role: m.role,
      status: m.status,
      heads: m.heads,
      contributed: round(contributedBy.get(m.id) ?? 0),
      loan_outstanding: round(activeLoans.filter((l) => l.membership_id === m.id).reduce((s, l) => s + Number(l.outstanding_balance), 0)),
      penalties_pending: round(penalties.filter((p) => p.membership_id === m.id && p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0)),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

module.exports = { groupSummary, fundSummary, membershipBalance, myBalance, groupLedger, fundTotals, memberBalances, financialReport };