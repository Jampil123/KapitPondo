// services/api/src/lib/headNames.js
// Names for the extra heads a member carries (migration 0065). Head 1 is the
// member themselves and never has a row here.

const supabase = require('../config/supabase');

/** Map of `${membershipId}:${headNo}` → name for the given memberships. */
async function loadHeadNames(membershipIds) {
  const ids = [...new Set(membershipIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('membership_head_names')
    .select('membership_id, head_no, name')
    .in('membership_id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [`${r.membership_id}:${r.head_no}`, r.name]));
}

/** Adds `head_name` to each loan (null for head 1 or an unnamed head). */
async function attachHeadNames(loans) {
  const list = Array.isArray(loans) ? loans : [loans];
  const names = await loadHeadNames(list.map((l) => l.membership_id));
  for (const l of list) l.head_name = names.get(`${l.membership_id}:${l.head_no}`) ?? null;
  return loans;
}

module.exports = { loadHeadNames, attachHeadNames };
