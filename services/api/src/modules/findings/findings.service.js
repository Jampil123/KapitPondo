// services/api/src/modules/findings/findings.service.js
// KapitPondo — Audit findings (migration 0067): the Auditor submits, the
// Organizer resolves or dismisses. Numbered per group (AF-03) and may cover
// flags already raised (migration 0071).

const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { logAudit } = require('../../lib/auditLog');

const SEVERITIES = ['low', 'medium', 'high'];
const CLOSED_STATUSES = ['resolved', 'dismissed'];

const SELECT = '*, raiser:members!raised_by(full_name), resolver:members!resolved_by(full_name)';

function findingRef(seq) {
  return `AF-${String(seq).padStart(2, '0')}`;
}

const withRef = (f) => ({ ...f, ref: findingRef(f.seq) });

async function listFindings({ groupId, status }) {
  let q = supabase
    .from('audit_findings')
    .select(SELECT)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status === 'open') q = q.eq('status', 'open');
  else if (status === 'closed') q = q.in('status', CLOSED_STATUSES);
  const { data, error } = await q;
  if (error) throw error;
  return data.map(withRef);
}

async function getFinding(id) {
  const { data, error } = await supabase.from('audit_findings').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return data;
}

async function getOwnerMemberId(groupId) {
  const { data, error } = await supabase.from('groups').select('owner_id').eq('id', groupId).single();
  if (error) throw error;
  return data.owner_id;
}

async function nextSeq(groupId) {
  const { data, error } = await supabase
    .from('audit_findings').select('seq').eq('group_id', groupId)
    .order('seq', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data?.seq ?? 0) + 1;
}

/** Keeps only flag ids that really belong to this group. */
async function groupFlagIds(groupId, flagIds) {
  if (!flagIds?.length) return [];
  const { data, error } = await supabase.from('audit_flags').select('id').eq('group_id', groupId).in('id', flagIds);
  if (error) throw error;
  return data.map((f) => f.id);
}

async function submitFinding({ groupId, actorId, actorRole, title, details, recommendation, severity, entityType, entityId, flagIds }) {
  const flag_ids = await groupFlagIds(groupId, flagIds);
  let data = null;
  // Two findings submitted at the same moment can race for a number — retry once on the unique clash.
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const seq = await nextSeq(groupId);
    const res = await supabase
      .from('audit_findings')
      .insert({
        group_id: groupId,
        seq,
        raised_by: actorId,
        title,
        details: details ?? null,
        recommendation: recommendation ?? null,
        severity,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        flag_ids,
      })
      .select(SELECT)
      .single();
    if (res.error && res.error.code === '23505' && attempt === 0) continue;
    if (res.error) throw res.error;
    data = res.data;
  }

  await logAudit({
    groupId, actorId, actorRole,
    action: 'submitted', entityType: 'audit_finding', entityId: data.id,
    before: null, after: { finding: findingRef(data.seq), title, severity, status: 'open', flags: flag_ids.length },
  });

  const ownerId = await getOwnerMemberId(groupId);
  if (ownerId) {
    await notify({
      memberId: ownerId,
      groupId,
      type: 'audit.finding',
      title: `New ${severity} audit finding ${findingRef(data.seq)}`,
      message: title,
    });
  }
  return withRef(data);
}

// Only an open finding can be closed; the caller (Organizer) must not be the
// one who raised it — also enforced by the table's check constraint.
async function closeFinding({ groupId, findingId, actorId, actorRole, status, note }) {
  const { data, error } = await supabase
    .from('audit_findings')
    .update({
      status,
      resolution_note: note ?? null,
      resolved_by: actorId,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', findingId)
    .eq('group_id', groupId)
    .eq('status', 'open')
    .select(SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  await logAudit({
    groupId, actorId, actorRole,
    action: status, entityType: 'audit_finding', entityId: findingId,
    before: { status: 'open' }, after: { status, note: note ?? null },
  });

  await notify({
    memberId: data.raised_by,
    groupId,
    type: 'audit.finding',
    title: status === 'resolved' ? 'Your audit finding was resolved' : 'Your audit finding was dismissed',
    message: note ? `${data.title}: ${note}` : data.title,
  });
  return withRef(data);
}

module.exports = { SEVERITIES, CLOSED_STATUSES, listFindings, getFinding, submitFinding, closeFinding };
