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
  approve: (b) => (b === 'owner' ? 'treasurer' : 'owner'),
  review: (b) => (b === 'auditor' ? 'treasurer' : 'auditor'),
  release: (b) => (b === 'treasurer' ? 'owner' : 'treasurer'),
  verify: (b) => (b === 'auditor' ? 'owner' : 'auditor'),
};

/** Notify everyone holding `role` except the people listed in `skip` (payer, recorder...). */
async function notifyRole({ groupId, role, skip = [], type, title, message }) {
  const ids = (await holdersOf(groupId, role)).filter((id) => !skip.includes(id));
  await Promise.all(ids.map((memberId) => notify({ memberId, groupId, type, title, message })));
}

module.exports = { ROLE_LABEL, roleOf, holdersOf, confirmRole, verifyRole, LOAN_DUTY, notifyRole };
