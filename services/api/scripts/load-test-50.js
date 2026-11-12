// services/api/scripts/load-test-50.js
// KapitPondo — 50-user load test with a live terminal view and a proof report.
//
// NO OTP / SMS: test users are created with EMAIL + PASSWORD only (no phone)
// and sign in with grant_type=password. Phone sign-up, signInWithOtp,
// updateUser({ phone }), /me/phone/sync, remind/nudge and the AI/OCR
// endpoints are never called, so nothing reaches the iProg send-sms hook
// or Gemini/Vision.
//
// Usage (from services/api, with the API running in another terminal):
//   node scripts/load-test-50.js all        # setup + run (normal use)
//   node scripts/load-test-50.js setup      # only create/refresh the 50 users
//   node scripts/load-test-50.js run        # only the timed test
//   node scripts/load-test-50.js cleanup    # remove test users (see load-test-cleanup.sql for groups)
// Add --verbose to print every single request as it happens.
//
// Env (.env): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// Optional:   API_BASE (default http://localhost:4000), USERS (default 50),
//             READ_ROUNDS (5), OFFICER_CONCURRENCY (5), LOGIN_SAMPLE (25)

'use strict';

require('dotenv').config({ quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const N = Number(process.env.USERS || 50);
const READ_ROUNDS = Number(process.env.READ_ROUNDS || 5);
const OFFICER_CONCURRENCY = Number(process.env.OFFICER_CONCURRENCY || 5);
const LOGIN_SAMPLE = Math.min(N, Number(process.env.LOGIN_SAMPLE || 25));
const VERBOSE = process.argv.includes('--verbose') || process.env.VERBOSE === '1';

const PASSWORD = 'KapitLoad_Test1!';
const EMAIL = (i) => `loadtest.u${String(i).padStart(2, '0')}@kapitpondo.test`;
const SESSION_FILE = path.join(os.tmpdir(), 'kapitpondo-loadtest-sessions.json');
const REPORT_DIR = path.join(__dirname, 'load-test-results');
const PROJECT_REF = (SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0];

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Terminal output ──────────────────────────────────────────

const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c('1'), dim = c('2'), red = c('31'), green = c('32'), yellow = c('33'), cyan = c('36');
const reportLines = []; // plain-text copy of the final report, saved to a file

function out(line = '') {
  console.log(line);
  reportLines.push(line.replace(/\x1b\[[0-9;]*m/g, ''));
}
function clearLive() { if (TTY) process.stdout.write('\r\x1b[2K'); }
const ms = (n) => `${Math.round(n)}ms`;
const secs = (n) => `${(n / 1000).toFixed(2)}s`;
const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

// Live status line for the phase that is running.
const live = { name: '', total: 0, done: 0, ok: 0, fail: 0, reqs: 0, lat: 0, last: 0, t0: 0, timer: null };

function drawLive() {
  if (!TTY || !live.name) return;
  const el = performance.now() - live.t0;
  const width = 24;
  const filled = live.total ? Math.round((live.done / live.total) * width) : 0;
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const avg = live.reqs ? live.lat / live.reqs : 0;
  const rps = el > 0 ? live.reqs / (el / 1000) : 0;
  process.stdout.write(
    `\r\x1b[2K  ${cyan(bar)} ${live.done}/${live.total}  ${green(`ok ${live.ok}`)}` +
    `${live.fail ? ' ' + red(`fail ${live.fail}`) : ''}  ${dim('|')} ${live.reqs} req  avg ${ms(avg)}` +
    `  last ${ms(live.last)}  ${rps.toFixed(1)} req/s  ${dim(secs(el))}`,
  );
}

// ── Metrics ──────────────────────────────────────────────────

const samples = {};
const phases = [];

function record(label, t, ok, status, detail) {
  (samples[label] ||= []).push({ ms: t, ok, status });
  live.reqs++; live.lat += t; live.last = t;
  if (VERBOSE) {
    clearLive();
    const st = ok ? green(status) : red(status);
    console.log(`    ${dim(new Date().toISOString().slice(11, 23))}  ${st}  ${String(Math.round(t)).padStart(5)}ms  ${label}${detail ? dim('  ' + detail) : ''}`);
  }
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summarize(list) {
  const t = list.map((s) => s.ms).sort((a, b) => a - b);
  const ok = list.filter((s) => s.ok).length;
  const failStatuses = {};
  for (const s of list) if (!s.ok) failStatuses[s.status] = (failStatuses[s.status] || 0) + 1;
  return {
    count: list.length, ok, fail: list.length - ok,
    min: t[0] || 0, avg: t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0,
    p50: pct(t, 50), p95: pct(t, 95), p99: pct(t, 99), max: t[t.length - 1] || 0, failStatuses,
  };
}

async function phase(name, total, fn) {
  console.log(`\n${bold('▶ ' + name)}`);
  Object.assign(live, { name, total, done: 0, ok: 0, fail: 0, reqs: 0, lat: 0, last: 0, t0: performance.now() });
  live.timer = TTY ? setInterval(drawLive, 100) : null;
  let result, error;
  try { result = await fn(); } catch (err) { error = err; }
  clearInterval(live.timer);
  drawLive(); clearLive();
  const t = performance.now() - live.t0;
  const ok = result?.ok ?? (error ? 0 : 1), fail = result?.fail ?? (error ? 1 : 0);
  const avg = live.reqs ? live.lat / live.reqs : 0;
  phases.push({ name, ms: t, ok, fail, requests: live.reqs, avgMs: avg, error: error?.message });
  live.name = '';
  const mark = error ? red('✗') : fail ? yellow('!') : green('✓');
  console.log(`  ${mark} ${secs(t)}  —  ${green(`ok ${ok}`)}${fail ? '  ' + red(`fail ${fail}`) : ''}  ` +
    `${dim(`(${live.reqs} requests, avg ${ms(avg)})`)}`);
  if (error) { console.log(`  ${red(error.message)}`); throw error; }
  return result;
}

// Run tasks with a concurrency cap; updates the live counters.
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0, ok = 0, fail = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i], i); ok++; live.ok++; } catch (err) {
        results[i] = { error: err.message, status: err.status }; fail++; live.fail++;
        // Show why the first few failed (429 sign-ins are expected and summarized later).
        if (fail <= 3 && err.status !== 429) { clearLive(); console.log(red(`    ✗ ${err.message.slice(0, 200)}`)); }
      }
      live.done++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return { ok, fail, results };
}

// ── HTTP helpers ─────────────────────────────────────────────

async function timedFetch(label, url, opts, detail) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    record(label, performance.now() - t0, false, 'NET', detail);
    throw err;
  }
  const text = await res.text();
  record(label, performance.now() - t0, res.ok, res.status, detail);
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = new Error(`${label} → ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function api(label, method, p, token, body, detail) {
  return timedFetch(label, `${API_BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, detail);
}

function passwordLogin(email, label = 'auth: password sign-in') {
  return timedFetch(label, `${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  }, email);
}

function refreshLogin(refreshToken, label = 'auth: refresh token') {
  return timedFetch(label, `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

const sleep = (t) => new Promise((r) => setTimeout(r, t));

function loadSessions() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch {}
  for (const k of Object.keys(s)) if (typeof s[k] === 'string') s[k] = { refresh_token: s[k] };
  return s;
}
function saveSessions(s) { fs.writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2)); }
const toSession = (s) => ({ user_id: s.user?.id, access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at });
// Access token still valid for at least 15 more minutes.
const freshEnough = (s) => s?.expires_at && s.expires_at * 1000 - Date.now() > 15 * 60_000;

// Sign in, waiting out Supabase's per-IP auth limit (HTTP 429) if needed.
async function signInWithRetry(email, label, onWait) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { return await passwordLogin(email, label); } catch (err) {
      if (err.status !== 429) throw err;
      onWait?.();
      await sleep(60_000);
    }
  }
  throw new Error(`Could not sign in ${email} (rate-limited 10 times)`);
}

// ── SETUP: N email-only users, verified, no phone ────────────

async function findAuthUserByEmail(email) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function setup() {
  console.log(bold(`\n=== Setup: ${N} load-test users (email + password, no phone → no OTP) ===`));
  const sessions = loadSessions();
  await phase(`Create / refresh ${N} test users`, N, () => pool(Array.from({ length: N }, (_, i) => i + 1), 1, async (i) => {
    const email = EMAIL(i);
    let user;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (!error) user = data.user;
    else {
      user = await findAuthUserByEmail(email);
      if (!user) throw new Error(`Create ${email}: ${error.message}`);
      await admin.auth.admin.updateUserById(user.id, { password: PASSWORD });
    }
    if (user.phone) throw new Error(`${email} has a phone number set — refusing (could trigger OTP flows)`);
    // A cached session from before a DB reset belongs to a deleted user.
    if (sessions[email]?.user_id && sessions[email].user_id !== user.id) delete sessions[email];

    const row = {
      auth_id: user.id, email, full_name: `Load Tester ${String(i).padStart(2, '0')}`,
      verification_status: 'verified', verified_at: new Date().toISOString(),
    };
    const { data: existing } = await admin.from('members').select('id').eq('auth_id', user.id).maybeSingle();
    const { error: mErr } = existing
      ? await admin.from('members').update(row).eq('id', existing.id)
      : await admin.from('members').insert(row);
    if (mErr) throw new Error(`Member row ${email}: ${mErr.message}`);

    // Users outside the login burst need a cached session so `run` doesn't
    // need 50 fresh sign-ins (Supabase limits sign-ins per IP).
    if (i > LOGIN_SAMPLE && !freshEnough(sessions[email])) {
      const s = await signInWithRetry(email, 'setup: sign-in', () => {
        clearLive(); console.log(yellow(`  Supabase auth rate limit hit at user ${i} — waiting 60s, then continuing...`));
      });
      sessions[email] = toSession(s);
      saveSessions(sessions);
    }
  }));
  saveSessions(sessions);
}

// ── RUN ──────────────────────────────────────────────────────

async function run() {
  const started = new Date();
  console.log(bold(`\n=== KapitPondo load test — ${N} users ===`));
  console.log(`API ${cyan(API_BASE)}   Supabase project ${cyan(PROJECT_REF)}   started ${started.toLocaleString()}`);
  if (!VERBOSE) console.log(dim('Tip: add --verbose to see every request live.'));
  const runStart = performance.now();
  const emails = Array.from({ length: N }, (_, i) => EMAIL(i + 1));
  const tokens = new Array(N).fill(null);
  const sessions = loadSessions();
  const meta = { started: started.toISOString() };

  try {
    await phase('0. API health check', 1, () => pool([0], 1, () => timedFetch('GET /health', `${API_BASE}/health`)));

    // 1. Burst of simultaneous sign-ins (real users sign in from their own phones/IPs).
    const login = await phase(`1. ${LOGIN_SAMPLE} users sign in at the same time`, LOGIN_SAMPLE, () =>
      pool(emails.slice(0, LOGIN_SAMPLE), LOGIN_SAMPLE, async (email, i) => {
        const s = await passwordLogin(email);
        tokens[i] = s.access_token;
        sessions[email] = toSession(s);
      }));
    meta.loginRateLimited = login.results.filter((r) => r?.status === 429).length;

    const missing = emails.map((e, i) => i).filter((i) => !tokens[i] && !freshEnough(sessions[emails[i]]));
    if (missing.length) {
      await phase(`1b. Retry ${missing.length} sign-ins blocked by Supabase's per-IP limit`, missing.length, () =>
        pool(missing, 1, async (i) => {
          const s = await signInWithRetry(emails[i], 'auth: retry sign-in', () => {
            clearLive(); console.log(yellow('  rate-limited — waiting 60s...'));
          });
          tokens[i] = s.access_token;
          sessions[emails[i]] = toSession(s);
        }));
    }
    emails.forEach((email, i) => { if (!tokens[i] && freshEnough(sessions[email])) tokens[i] = sessions[email].access_token; });
    saveSessions(sessions);
    const noToken = tokens.filter((t) => !t).length;
    if (noToken) throw new Error(`${noToken} users have no valid session — run: node scripts/load-test-50.js setup`);

    // 2. Every user opens the app (profile load).
    const members = new Array(N);
    await phase(`2. ${N} users open the app at the same time (profile load)`, N, () => pool(tokens, N, async (t, i) => {
      const me = await api('GET /me', 'GET', '/me', t, undefined, emails[i]);
      members[i] = me.member;
      await api('GET /api/me/profile', 'GET', '/api/me/profile', t, undefined, emails[i]);
    }));
    const [owner, treasurer, auditor] = tokens;

    // 3. Organizer creates a group.
    const fundCode = `LT${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
    let groupId;
    await phase('3. Organizer (user 01) creates a group', 1, () => pool([0], 1, async () => {
      const r = await api('POST /api/groups', 'POST', '/api/groups', owner, {
        name: `Load Test ${new Date().toISOString().slice(0, 16)}`, fund_code: fundCode, description: 'load-test-50',
      }, `fund code ${fundCode}`);
      groupId = r.group.id;
    }));
    Object.assign(meta, { groupId, fundCode });
    const g = `/api/groups/${groupId}`;

    await phase(`4. ${N - 1} users join with fund code ${fundCode} at the same time`, N - 1, () =>
      pool(tokens.slice(1), N, (t, i) =>
        api('POST /api/groups/join-by-code', 'POST', '/api/groups/join-by-code', t, { fund_code: fundCode }, emails[i + 1])));

    await phase(`5. Organizer approves ${N - 1} join requests (${OFFICER_CONCURRENCY} at a time)`, N - 1, () =>
      pool(members.slice(1), OFFICER_CONCURRENCY, (m) =>
        api('PATCH members/:id/approve', 'PATCH', `${g}/members/${m.id}/approve`, owner, undefined, m.email)));

    await phase('6. Organizer appoints Treasurer (user 02) and Auditor (user 03)', 2, () =>
      pool([['treasurer', members[1]], ['auditor', members[2]]], 1, ([role, m]) =>
        api('PATCH members/:id/role', 'PATCH', `${g}/members/${m.id}/role`, owner, { role }, `${m.email} → ${role}`)));

    const AMOUNT = 100;
    let cycleId;
    await phase(`7. Start a contribution cycle (${peso(AMOUNT)} per member)`, 1, () => pool([0], 1, async () => {
      const r = await api('POST cycles', 'POST', `${g}/cycles`, owner, {
        name: 'Load Test Cycle', contribution_amount: AMOUNT, start_date: new Date().toISOString().slice(0, 10), frequency: 'monthly',
      });
      cycleId = r.cycle.id;
      // A group's first cycle is created already active; only a draft needs activating.
      if (r.cycle.status === 'draft') await api('POST cycles/:id/activate', 'POST', `${g}/cycles/${cycleId}/activate`, owner);
    }));

    const payers = tokens.slice(3);
    const sub = await phase(`8. ${payers.length} members pay their contribution at the same time`, payers.length, () =>
      pool(payers, N, (t, i) => api('POST contributions', 'POST', `${g}/contributions`, t, {
        cycle_id: cycleId, amount: AMOUNT, payment_method: 'cash', external_reference: `LOAD-${Date.now()}-${i}`,
      }, `${emails[i + 3]} ${peso(AMOUNT)}`)));
    const contribIds = sub.results.filter((r) => r?.contribution).map((r) => r.contribution.id);

    await phase(`9. Treasurer confirms ${contribIds.length} payments (${OFFICER_CONCURRENCY} at a time)`, contribIds.length, () =>
      pool(contribIds, OFFICER_CONCURRENCY, (id) =>
        api('POST contributions/:id/confirm', 'POST', `${g}/contributions/${id}/confirm`, treasurer, undefined, id.slice(0, 8))));

    await phase(`10. Auditor verifies ${contribIds.length} payments and posts them to the ledger`, contribIds.length, () =>
      pool(contribIds, OFFICER_CONCURRENCY, (id) =>
        api('POST contributions/:id/verify', 'POST', `${g}/contributions/${id}/verify`, auditor, undefined, id.slice(0, 8))));

    const memberReads = [
      ['GET /api/groups', '/api/groups'],
      ['GET groups/:id', g],
      ['GET cycles', `${g}/cycles`],
      ['GET cycles/:id/progress', `${g}/cycles/${cycleId}/progress`],
      ['GET contributions', `${g}/contributions`],
      ['GET members/directory', `${g}/members/directory`],
      ['GET announcements', `${g}/announcements`],
      ['GET messages', `${g}/messages?channel=general`],
      ['GET /api/me/notifications', '/api/me/notifications'],
    ];
    const officerReads = [
      ['GET members (officer)', `${g}/members`],
      ['GET reports/summary (officer)', `${g}/reports/summary`],
    ];
    await phase(`11. ${N} users browse ${memberReads.length} screens, ${READ_ROUNDS} rounds each`, N, () =>
      pool(tokens, N, async (t, i) => {
        let failed = 0;
        for (let r = 0; r < READ_ROUNDS; r++) {
          const reads = i < 3 ? [...memberReads, ...officerReads] : memberReads;
          const res = await Promise.allSettled(reads.map(([label, p]) => api(label, 'GET', p, t, undefined, emails[i])));
          failed += res.filter((x) => x.status === 'rejected').length;
        }
        if (failed) throw new Error(`${failed} reads failed for ${emails[i]}`);
      }));
  } catch (err) {
    meta.aborted = err.message;
  }

  const totalMs = performance.now() - runStart;
  saveSessions(sessions);
  const proof = meta.groupId ? await dbProof(meta.groupId) : null;
  await report(totalMs, meta, proof);
  if (meta.aborted) process.exitCode = 1;
}

// ── Proof: read back what the test actually wrote to the database ──

async function dbProof(groupId) {
  const count = async (q) => { const { count: n, error } = await q; if (error) throw error; return n; };
  try {
    const [active, officers, contribs, verified] = await Promise.all([
      count(admin.from('memberships').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'active')),
      admin.from('memberships').select('role').eq('group_id', groupId).in('role', ['owner', 'treasurer', 'auditor']),
      count(admin.from('contributions').select('id', { count: 'exact', head: true }).eq('group_id', groupId)),
      count(admin.from('contributions').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'approved')),
    ]);
    const { data: ledger, error: lErr } = await admin.from('ledger_entries').select('amount, direction').eq('group_id', groupId);
    if (lErr) throw lErr;
    const ledgerTotal = ledger.reduce((s, e) => s + (e.direction === 'credit' ? 1 : -1) * Number(e.amount), 0);
    const { data: users } = await admin.from('members').select('id, phone').like('email', 'loadtest.u%@kapitpondo.test');
    return {
      activeMembers: active,
      officerRoles: (officers.data || []).map((o) => o.role).sort(),
      contributions: contribs, contributionsPosted: verified,
      ledgerEntries: ledger.length, ledgerTotal,
      testUsers: users?.length ?? 0, testUsersWithPhone: (users || []).filter((u) => u.phone).length,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function report(totalMs, meta, proof) {
  const endpoints = Object.entries(samples).map(([label, list]) => ({ label, ...summarize(list) }));
  const overall = summarize(Object.values(samples).flat());
  const W = 92, line = '═'.repeat(W), thin = '─'.repeat(W);
  const r = (n) => String(Math.round(n)).padStart(6);

  out(''); out(bold(line));
  out(bold('  KAPITPONDO LOAD TEST REPORT'));
  out(line);
  out(`  Date            ${new Date(meta.started).toLocaleString()}`);
  out(`  Virtual users   ${N}  (Organizer, Treasurer, Auditor + ${N - 3} members)`);
  out(`  API             ${API_BASE}`);
  out(`  Supabase        ${PROJECT_REF}`);
  out(`  Test group      ${meta.fundCode || '—'}  ${dim(meta.groupId || '')}`);
  out(`  OTP / SMS       none sent — email + password accounts only, no phone numbers`);
  out(`  Result          ${meta.aborted ? red('ABORTED: ' + meta.aborted) : green('COMPLETED')}`);

  out(''); out(bold('  PROCESS RUNNING TIME')); out('  ' + thin.slice(2));
  for (const p of phases) {
    const mark = p.error ? red('✗') : p.fail ? yellow('!') : green('✓');
    out(`  ${mark} ${p.name.padEnd(70).slice(0, 70)} ${secs(p.ms).padStart(9)}` +
      `${p.fail ? '  ' + red(`fail ${p.fail}`) : ''}`);
  }
  out('  ' + thin.slice(2));
  out(bold(`    ${'TOTAL RUNNING TIME'.padEnd(70)} ${secs(totalMs).padStart(9)}`));

  out(''); out(bold('  RESPONSE TIME PER ENDPOINT (milliseconds)')); out('  ' + thin.slice(2));
  out(dim(`  ${'endpoint'.padEnd(32)}  count  fail    min    avg    p50    p95    p99    max`));
  for (const e of endpoints) {
    const row = `  ${e.label.padEnd(32)} ${String(e.count).padStart(6)} ${String(e.fail).padStart(5)} ${r(e.min)} ${r(e.avg)} ${r(e.p50)} ${r(e.p95)} ${r(e.p99)} ${r(e.max)}`;
    out(e.fail ? `${row}  ${red(JSON.stringify(e.failStatuses))}` : row);
  }
  out('  ' + thin.slice(2));
  out(`  ${'ALL REQUESTS'.padEnd(32)} ${String(overall.count).padStart(6)} ${String(overall.fail).padStart(5)} ${r(overall.min)} ${r(overall.avg)} ${r(overall.p50)} ${r(overall.p95)} ${r(overall.p99)} ${r(overall.max)}`);
  out(dim('  p50 = half of requests were faster; p95 = 95 of 100 requests were faster.'));

  out(''); out(bold('  SUMMARY')); out('  ' + thin.slice(2));
  const errRate = overall.count ? (overall.fail / overall.count) * 100 : 0;
  out(`  Total requests          ${overall.count}`);
  out(`  Successful              ${green(overall.ok)}`);
  out(`  Failed                  ${overall.fail ? red(overall.fail) : overall.fail}  (${errRate.toFixed(1)}%)` +
    (meta.loginRateLimited ? dim(`  incl. ${meta.loginRateLimited} sign-ins blocked by Supabase's per-IP limit (HTTP 429)`) : ''));
  out(`  Average response time   ${ms(overall.avg)}`);
  out(`  95th percentile         ${ms(overall.p95)}`);
  out(`  Throughput              ${(overall.count / (totalMs / 1000)).toFixed(1)} requests/second`);

  if (proof) {
    out(''); out(bold('  DATABASE PROOF (read back from Supabase after the test)')); out('  ' + thin.slice(2));
    if (proof.error) out(red(`  Could not read proof: ${proof.error}`));
    else {
      const chk = (okay) => (okay ? green('✓') : red('✗'));
      const payers = N - 3;
      out(`  ${chk(proof.activeMembers === N)} Active members in test group   ${proof.activeMembers} / ${N}`);
      out(`  ${chk(['auditor', 'owner', 'treasurer'].every((x) => proof.officerRoles.includes(x)))} Officer roles                  ${proof.officerRoles.join(', ')}`);
      out(`  ${chk(proof.contributions === payers)} Contributions recorded         ${proof.contributions} / ${payers}`);
      out(`  ${chk(proof.contributionsPosted === payers)} Contributions verified/posted  ${proof.contributionsPosted} / ${payers}`);
      out(`  ${chk(proof.ledgerEntries >= payers)} Ledger entries                 ${proof.ledgerEntries}`);
      out(`  ${chk(Math.abs(proof.ledgerTotal - payers * 100) < 0.01)} Ledger balance                 ${peso(proof.ledgerTotal)}  (expected ${peso(payers * 100)})`);
      out(`  ${chk(proof.testUsersWithPhone === 0)} Test users with a phone number ${proof.testUsersWithPhone}  (0 = no OTP possible)`);
    }
  }
  out(line);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const txt = path.join(REPORT_DIR, `load-test-${stamp}.txt`);
  const json = path.join(REPORT_DIR, `load-test-${stamp}.json`);
  fs.writeFileSync(txt, reportLines.join('\n') + '\n');
  fs.writeFileSync(json, JSON.stringify({ users: N, apiBase: API_BASE, project: PROJECT_REF, totalMs, meta, proof, phases, endpoints, overall }, null, 2));
  console.log(`\n  Report saved:\n    ${txt}\n    ${json}\n`);
}

// ── CLEANUP: test users only (groups need load-test-cleanup.sql) ──

async function cleanup() {
  console.log(bold('=== Cleanup: load-test users ==='));
  console.log(dim('Groups with ledger/audit rows cannot be deleted from here (append-only); use scripts/load-test-cleanup.sql.'));
  for (let i = 1; i <= N; i++) {
    const u = await findAuthUserByEmail(EMAIL(i));
    if (!u) continue;
    const { error } = await admin.auth.admin.deleteUser(u.id);
    console.log(`  ${EMAIL(i)}: ${error ? red(`NOT deleted (${error.message})`) : green('deleted')}`);
  }
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}

const cmd = process.argv[2];
const commands = { setup, run, cleanup, all: async () => { await setup(); await run(); } };
if (!commands[cmd]) {
  console.log('Usage: node scripts/load-test-50.js <all|setup|run|cleanup> [--verbose]');
  process.exit(1);
}
commands[cmd]().catch((err) => { clearLive(); console.error(red(`\nFatal: ${err.message}`)); process.exit(1); });
