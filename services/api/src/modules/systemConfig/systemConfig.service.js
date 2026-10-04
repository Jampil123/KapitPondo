/**
 * services/api/src/modules/systemConfig/systemConfig.service.js
 * System Configuration (migration 0066): settings, system announcements and
 * system policies. Platform-level only — nothing here touches a fund group's
 * money or records. Every administrator change is written to
 * system_audit_log.
 */
const supabase = require('../../config/supabase');
const { notify } = require('../../lib/notifications');
const { TEMPLATE_DEFS, getSetting, setSetting } = require('../../lib/systemConfig');

const OFFICER_ROLES = ['owner', 'treasurer', 'auditor'];
const POLICY_KINDS = ['terms', 'privacy', 'community'];

class ValidationError extends Error {}

async function audit(actorAuthId, action, targetId, metadata) {
  await supabase.from('system_audit_log').insert({
    actor_id: actorAuthId, action, target_type: 'system', target_id: targetId ?? null, metadata,
  });
}

function slug(label) {
  return String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

// --- settings ----------------------------------------------------------------

async function getConfig() {
  const [verification_requirements, complaint_categories, notification_templates] = await Promise.all([
    getSetting('verification_requirements'),
    getSetting('complaint_categories'),
    getSetting('notification_templates'),
  ]);
  return {
    settings: { verification_requirements, complaint_categories, notification_templates },
    template_defs: TEMPLATE_DEFS,
  };
}

// Normalises an incoming value for `key`, or throws ValidationError.
function validate(key, value) {
  if (key === 'verification_requirements') {
    const types = Array.isArray(value?.accepted_id_types) ? value.accepted_id_types : [];
    const cleaned = types
      .filter((t) => t && String(t.label ?? '').trim())
      .map((t) => ({ value: t.value ? String(t.value) : slug(t.label), label: String(t.label).trim(), active: t.active !== false }));
    if (!cleaned.some((t) => t.active)) throw new ValidationError('Keep at least one accepted ID type active.');
    if (new Set(cleaned.map((t) => t.value)).size !== cleaned.length) throw new ValidationError('ID types must be unique.');
    const minimum_age = Number(value?.minimum_age ?? 0);
    if (!Number.isInteger(minimum_age) || minimum_age < 0 || minimum_age > 100) throw new ValidationError('Minimum age must be a whole number from 0 to 100.');
    return {
      accepted_id_types: cleaned,
      require_id_back: !!value.require_id_back,
      require_selfie: !!value.require_selfie,
      minimum_age,
    };
  }
  if (key === 'complaint_categories') {
    const list = Array.isArray(value) ? value : [];
    const cleaned = list
      .filter((c) => c && String(c.label ?? '').trim())
      .map((c) => ({ key: c.key ? String(c.key) : slug(c.label), label: String(c.label).trim(), active: c.active !== false }));
    if (!cleaned.some((c) => c.active)) throw new ValidationError('Keep at least one category active.');
    if (new Set(cleaned.map((c) => c.key)).size !== cleaned.length) throw new ValidationError('Category names must be unique.');
    return cleaned;
  }
  if (key === 'notification_templates') {
    const out = {};
    for (const def of TEMPLATE_DEFS) {
      const t = value?.[def.type];
      const title = String(t?.title ?? '').trim();
      const message = String(t?.message ?? '').trim();
      // Only store real overrides; matching the default means "no override".
      if ((title && title !== def.title) || (message && message !== def.message)) {
        out[def.type] = { title: title || def.title, message: message || def.message };
      }
    }
    return out;
  }
  throw new ValidationError(`Unknown setting "${key}"`);
}

async function updateSetting(key, value, { adminMemberId, actorAuthId }) {
  // A category can be switched off but never removed: existing complaints use
  // its key, so one left out of the list is kept, inactive.
  let normalized = validate(key, value);
  if (key === 'complaint_categories') {
    const current = await getSetting('complaint_categories');
    const kept = current.filter((c) => !normalized.some((n) => n.key === c.key)).map((c) => ({ ...c, active: false }));
    normalized = [...normalized, ...kept];
  }
  await setSetting(key, normalized, adminMemberId);
  await audit(actorAuthId, 'config.updated', null, { setting: key });
  return getSetting(key);
}

// --- announcements -------------------------------------------------------------

function cleanAnnouncement(body) {
  const title = String(body?.title ?? '').trim();
  const text = String(body?.body ?? '').trim();
  if (!title || !text) throw new ValidationError('An announcement needs a title and a message.');
  const audience = body.audience === 'officers' ? 'officers' : 'all';
  const tone = ['info', 'warning', 'critical'].includes(body.tone) ? body.tone : 'info';
  const starts_at = body.starts_at ? new Date(body.starts_at).toISOString() : new Date().toISOString();
  const ends_at = body.ends_at ? new Date(body.ends_at).toISOString() : null;
  if (ends_at && ends_at <= starts_at) throw new ValidationError('The end date must be after the start date.');
  return { title, body: text, audience, tone, starts_at, ends_at };
}

async function listAnnouncements() {
  const { data, error } = await supabase.from('system_announcements').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Every member the announcement is for — all accounts, or active officers.
async function audienceMemberIds(audience) {
  if (audience === 'officers') {
    const { data } = await supabase.from('memberships').select('member_id').eq('status', 'active').in('role', OFFICER_ROLES);
    return [...new Set((data ?? []).map((m) => m.member_id))];
  }
  const { data } = await supabase.from('members').select('id');
  return (data ?? []).map((m) => m.id);
}

async function pushAnnouncement(a) {
  const ids = await audienceMemberIds(a.audience);
  await Promise.all(ids.map((memberId) => notify({
    memberId, type: 'system.announcement', title: a.title, message: a.body, data: { announcement_id: a.id },
  })));
  return ids.length;
}

async function saveAnnouncement(id, body, { adminMemberId, actorAuthId }) {
  const fields = cleanAnnouncement(body);
  const published = !!body.published;
  let row;
  let wasPublished = false;
  if (id) {
    const { data: before } = await supabase.from('system_announcements').select('published').eq('id', id).maybeSingle();
    if (!before) return null;
    wasPublished = before.published;
    const { data, error } = await supabase.from('system_announcements')
      .update({ ...fields, published, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    row = data;
  } else {
    const { data, error } = await supabase.from('system_announcements')
      .insert({ ...fields, published, created_by: adminMemberId }).select().single();
    if (error) throw error;
    row = data;
  }
  let notified = 0;
  // Push only on the moment it goes live, and only if asked.
  if (published && !wasPublished && body.notify) notified = await pushAnnouncement(row);
  await audit(actorAuthId, published && !wasPublished ? 'announcement.published' : 'announcement.saved', row.id, { title: row.title, notified });
  return { announcement: row, notified };
}

async function deleteAnnouncement(id, { actorAuthId }) {
  const { data, error } = await supabase.from('system_announcements').delete().eq('id', id).select('id, title').maybeSingle();
  if (error) throw error;
  if (data) await audit(actorAuthId, 'announcement.deleted', id, { title: data.title });
  return data;
}

// Live announcements for one member (the app's banner).
async function liveAnnouncements(memberId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('system_announcements')
    .select('id, title, body, audience, tone, starts_at, ends_at')
    .eq('published', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('starts_at', { ascending: false });
  if (error) throw error;
  if (!data.some((a) => a.audience === 'officers')) return data;
  const { data: officer } = await supabase.from('memberships').select('id')
    .eq('member_id', memberId).eq('status', 'active').in('role', OFFICER_ROLES).limit(1);
  const isOfficer = (officer ?? []).length > 0;
  return data.filter((a) => a.audience === 'all' || isOfficer);
}

// --- policies --------------------------------------------------------------------

async function listPolicies() {
  const { data, error } = await supabase.from('system_policies').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createPolicy(body, { adminMemberId, actorAuthId }) {
  const kind = String(body?.kind ?? '');
  if (!POLICY_KINDS.includes(kind)) throw new ValidationError('Unknown policy type.');
  const title = String(body.title ?? '').trim();
  const text = String(body.body ?? '').trim();
  const version = String(body.version ?? '').trim();
  if (!title || !text || !version) throw new ValidationError('A policy needs a title, a version and its text.');
  const { data, error } = await supabase.from('system_policies')
    .insert({ kind, title, body: text, version, created_by: adminMemberId, published_at: body.publish ? new Date().toISOString() : null })
    .select().single();
  if (error) {
    if (error.code === '23505') throw new ValidationError(`Version "${version}" already exists for this policy.`);
    throw error;
  }
  await audit(actorAuthId, body.publish ? 'policy.published' : 'policy.drafted', data.id, { kind, version });
  return data;
}

async function publishPolicy(id, { actorAuthId }) {
  const { data, error } = await supabase.from('system_policies')
    .update({ published_at: new Date().toISOString() })
    .eq('id', id).is('published_at', null).select().maybeSingle();
  if (error) throw error;
  if (data) await audit(actorAuthId, 'policy.published', id, { kind: data.kind, version: data.version });
  return data;
}

// Drafts only — a published version is part of what members agreed to.
async function deletePolicyDraft(id, { actorAuthId }) {
  const { data, error } = await supabase.from('system_policies')
    .delete().eq('id', id).is('published_at', null).select('id, kind, version').maybeSingle();
  if (error) throw error;
  if (data) await audit(actorAuthId, 'policy.draft_deleted', id, { kind: data.kind, version: data.version });
  return data;
}

async function currentPolicy(kind) {
  if (!POLICY_KINDS.includes(kind)) return null;
  const { data, error } = await supabase.from('system_policies')
    .select('kind, title, body, version, published_at')
    .eq('kind', kind).not('published_at', 'is', null)
    .order('published_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// --- what the member app reads ----------------------------------------------------

async function publicConfig() {
  const [vr, categories] = await Promise.all([getSetting('verification_requirements'), getSetting('complaint_categories')]);
  return {
    verification: {
      accepted_id_types: vr.accepted_id_types.filter((t) => t.active !== false).map(({ value, label }) => ({ value, label })),
      require_id_back: vr.require_id_back,
      require_selfie: vr.require_selfie,
      minimum_age: vr.minimum_age,
    },
    complaint_categories: categories.filter((c) => c.active !== false).map(({ key, label }) => ({ key, label })),
  };
}

module.exports = {
  ValidationError, POLICY_KINDS,
  getConfig, updateSetting,
  listAnnouncements, saveAnnouncement, deleteAnnouncement, liveAnnouncements,
  listPolicies, createPolicy, publishPolicy, deletePolicyDraft, currentPolicy,
  publicConfig,
};
