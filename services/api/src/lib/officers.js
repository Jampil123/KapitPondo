// services/api/src/lib/officers.js
// KapitPondo — Who holds a role in a group, and nudging them when a record
// lands on their step of the two-step money flow (migration 0075). The SQL
// functions decide who MAY act; this only tells the right people something is
// waiting. Mirrors money_in_confirm_role / money_in_verify_role /
// loan_duty_role so the notification goes where the check will pass.

const supabase = require('../config/supabase');
const { notify } = require('./notifications');

const ROLE_LABEL = { owner: 'Organizer', treasurer: 'Treasurer', auditor: 'Auditor', member: 'Member' };

async function roleOf(groupId, memberId) {
  const { data, error } = await supabase
    .from('memberships').select('role')
    .eq('group_id', groupId).eq('member_id', memberId).eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

async function holdersOf(groupId, role) {
  const { data, error } = await supabase
    .from('memberships').select('member_id')
    .eq('group_id', groupId).eq('role', role).eq('status', 'active');
  if (error) throw error;
  return data.map((m) => m.member_id);
}

// Same rules as the SQL helpers in 0075.
const confirmRole = (payerRole) => (payerRole === 'treasurer' ? 'owner' : 'treasurer');
async function verifyRole(groupId, payerRole, recorderRole = null) {
  if (payerRole === 'auditor' || recorderRole === 'auditor') return 'owner';
  return (await holdersOf(groupId, 'auditor')).length ? 'auditor' : 'owner';
}
const LOAN_DUTY = {
  approve: (b) => (b === 'owner' ? 'auditor' : 'owner'), // see loanApproverRole for the no-Auditor fallback (0072)
  review: (b) => (b === 'auditor' ? 'treasurer' : 'auditor'),
  release: () => 'treasurer', // the Treasurer releases their own loan too (0070)
  verify: (b) => (b === 'auditor' ? 'owner' : 'auditor'),
};

/** Who decides this borrower's loan in this group: the Auditor decides the Organizer's own (E6, 0072), or the Treasurer when there's no Auditor. Mirrors loan_approver_role. */
async function loanApproverRole(groupId, borrowerRole) {
  if (borrowerRole !== 'owner') return 'owner';
  return (await holdersOf(groupId, 'auditor')).length ? 'auditor' : 'treasurer';
}

/** Notify everyone holding `role` except the people listed in `skip` (payer, recorder...). */
async function notifyRole({ groupId, role, skip = [], type, title, message }) {
  const ids = (await holdersOf(groupId, role)).filter((id) => !skip.includes(id));
  await Promise.all(ids.map((memberId) => notify({ memberId, groupId, type, title, message })));
}

module.exports = { ROLE_LABEL, roleOf, holdersOf, confirmRole, verifyRole, LOAN_DUTY, loanApproverRole, notifyRole };
