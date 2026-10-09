/**
 * services/api/src/lib/systemConfig.js
 * System Configuration (migration 0066) — the System Administrator's
 * platform-level settings, with built-in defaults.
 *
 * A setting that was never saved (or a database without migration 0066)
 * reads as its default, so every caller can rely on getSetting() returning a
 * complete value. Reads are cached briefly because notify() and the identity
 * submission check consult them on every call.
 */
const supabase = require('../config/supabase');

const DEFAULTS = {
  verification_requirements: {
    accepted_id_types: [
      { value: 'passport', label: 'Philippine Passport', active: true },
      { value: 'drivers_license', label: "Driver's License", active: true },
      { value: 'umid', label: 'UMID', active: true },
      { value: 'philsys', label: 'PhilSys National ID', active: true },
      { value: 'sss', label: 'SSS ID', active: true },
    ],
    require_id_back: false,
    require_selfie: true,
    minimum_age: 18,
  },
  complaint_categories: [
    { key: 'account_information', label: 'Incorrect account information', active: true },
    { key: 'identity_verification', label: 'Identity verification problem', active: true },
    { key: 'technical', label: 'Technical problem', active: true },
    { key: 'group_activity', label: 'Inappropriate group activity', active: true },
    { key: 'account_concern', label: 'Account-related concern', active: true },
    { key: 'other', label: 'Other', active: true },
  ],
  // type → { title, message } overrides of TEMPLATE_DEFS below.
  notification_templates: {},
};

// The platform notifications an administrator may reword. Each lists the
// {placeholders} its sender fills in; the defaults are the original texts.
const TEMPLATE_DEFS = [
  { type: 'identity.verified', label: 'ID verified', vars: [],
    title: 'Account verified',
    message: 'Your identity has been verified. You can now create groups, request loans, and be appointed an officer.' },
  { type: 'identity.resubmission_required', label: 'ID re-submission requested', vars: ['reason'],
    title: 'Please resubmit your ID',
    message: 'Your ID needs to be submitted again: {reason}' },
  { type: 'identity.rejected', label: 'ID rejected', vars: ['reason'],
    title: 'Verification rejected',
    message: 'Your ID verification was rejected: {reason}' },
  { type: 'account.suspended', label: 'Account suspended', vars: ['reason'],
    title: 'Account suspended',
    message: 'Your account has been suspended: {reason}' },
  { type: 'account.reinstated', label: 'Account reinstated', vars: [],
    title: 'Account reinstated',
    message: 'Your account has been reinstated. You can sign in again.' },
  { type: 'group.suspended', label: 'Fund group suspended', vars: ['group', 'reason'],
    title: 'Fund group suspended',
    message: '{group} has been suspended: {reason}. You can still view its records.' },
  { type: 'group.reinstated', label: 'Fund group reinstated', vars: ['group'],
    title: 'Fund group reinstated',
    message: '{group} has been reinstated. Group activity is back to normal.' },
];

const SETTING_KEYS = Object.keys(DEFAULTS);
const TTL_MS = 30_000;
let cache = null; // { at, values }

function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /system_settings/.test(error?.message ?? '');
}

async function loadAll() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const values = {};
  const { data, error } = await supabase.from('system_settings').select('key, value');
  if (error && !isMissingTable(error)) throw error;
  for (const row of data ?? []) values[row.key] = row.value;
  cache = { at: Date.now(), values };
  return values;
}

async function getSetting(key) {
  const values = await loadAll();
  const saved = values[key];
  const def = DEFAULTS[key];
  if (saved === undefined || saved === null) return def;
  // Objects merge over the default so a newly added field still has a value.
  if (!Array.isArray(def) && typeof def === 'object') return { ...def, ...saved };
  return saved;
}

async function setSetting(key, value, adminMemberId) {
  const { error } = await supabase.from('system_settings').upsert({
    key, value, updated_by: adminMemberId, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  cache = null;
}

// {placeholder} substitution; an empty placeholder also drops the ": " that
// introduced it, so "rejected: {reason}" with no reason reads "rejected".
function fill(text, vars) {
  return text
    .replace(/:\s*\{(\w+)\}/g, (m, k) => (vars[k] ? `: ${vars[k]}` : ''))
    .replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : ''))
    .trim();
}

// The administrator's wording for a notification type, rendered with `vars`;
// null when the type has no override (the sender's own text is used).
async function renderTemplate(type, vars = {}) {
  if (!TEMPLATE_DEFS.some((d) => d.type === type)) return null;
  const overrides = await getSetting('notification_templates');
  const t = overrides?.[type];
  if (!t || (!t.title && !t.message)) return null;
  const def = TEMPLATE_DEFS.find((d) => d.type === type);
  return { title: fill(t.title || def.title, vars), message: fill(t.message || def.message, vars) };
}

module.exports = { DEFAULTS, TEMPLATE_DEFS, SETTING_KEYS, getSetting, setSetting, renderTemplate, isMissingTable };
