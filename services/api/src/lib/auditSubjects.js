// services/api/src/lib/auditSubjects.js
// KapitPondo — What each audit_log row is ABOUT, in the words the app shows:
// whose record it was and the numbers people use to point at things
// (LE-1043, LN-0147, FL-07, AF-03). One batched lookup per entity type for a
// whole page of rows, attached as `subject` so the app can say "Verified loan
// repayment LE-1043" instead of "Verified a repayment".

const supabase = require('../config/supabase');

const pad = (n, w) => String(n).padStart(w, '0');

// ids go in the query string — chunk them so a 5,000-row export can't build an oversized URL.
const CHUNK = 150;
async function inChunks(ids, run) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await run(ids.slice(i, i + CHUNK))));
  return out;
}

async function select(table, columns, ids) {
  return inChunks(ids, async (chunk) => {
    const { data, error } = await supabase.from(table).select(columns).in('id', chunk);
    if (error) throw error;
    return data;
  });
}

async function withSubjects(rows) {
  const ids = (...types) => [...new Set(rows.filter((r) => types.includes(r.entity_type) && r.entity_id).map((r) => r.entity_id))];
  const subjects = new Map();

  const contributionIds = ids('contribution');
  const paymentIds = ids('loan_payment');
  const [contributions, payments, loans, reversals, flags, findings] = await Promise.all([
    select('contributions', 'id, ledger_entry:ledger_entries!ledger_entry_id(entry_no), memberships!membership_id(members!member_id(full_name))', contributionIds),
    select('loan_payments', 'id, ledger_entry:ledger_entries!ledger_entry_id(entry_no), loans(loan_no, membership:memberships!membership_id(members!member_id(full_name)))', paymentIds),
    select('loans', 'id, loan_no, membership:memberships!membership_id(members!member_id(full_name))', ids('loan', 'loan_decision', 'loan_disbursement')),
    select('ledger_reversal_requests', 'id, entry:ledger_entries!entry_id(entry_no, membership:memberships!membership_id(members!member_id(full_name))), reversal:ledger_entries!reversal_entry_id(entry_no)', ids('reversal_request')),
    select('audit_flags', 'id, seq', ids('audit_flag')),
    select('audit_findings', 'id, seq', ids('audit_finding')),
  ]);

  contributions.forEach((c) => subjects.set(c.id, { name: c.memberships?.members?.full_name ?? null, entry: c.ledger_entry?.entry_no ?? null }));
  payments.forEach((p) => subjects.set(p.id, { name: p.loans?.membership?.members?.full_name ?? null, entry: p.ledger_entry?.entry_no ?? null, loan: p.loans?.loan_no ?? null }));
  loans.forEach((l) => subjects.set(l.id, { name: l.membership?.members?.full_name ?? null, loan: l.loan_no }));
  reversals.forEach((r) => subjects.set(r.id, { name: r.entry?.membership?.members?.full_name ?? null, entry: r.entry?.entry_no ?? null, reversing_entry: r.reversal?.entry_no ?? null }));
  flags.forEach((f) => subjects.set(f.id, { ref: `FL-${pad(f.seq, 2)}` }));
  findings.forEach((f) => subjects.set(f.id, { ref: `AF-${pad(f.seq, 2)}` }));

  const format = (s) => s && {
    name: s.name ?? null,
    entry_ref: s.entry ? `LE-${1000 + s.entry}` : null,
    loan_ref: s.loan ? `LN-${pad(s.loan, 4)}` : null,
    reversing_entry_ref: s.reversing_entry ? `LE-${1000 + s.reversing_entry}` : null,
    ref: s.ref ?? null,
  };
  return rows.map((r) => ({ ...r, subject: format(subjects.get(r.entity_id)) ?? null }));
}

module.exports = { withSubjects };
