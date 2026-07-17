// Live verification of M9 fixes:
//   TC-015: Owner cannot finalize until an Auditor has verified the preview.
//   TC-027: Auditor verifies the preview.
//   TC-038: an Unverified member still gets their proportional payout.
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'http://localhost:4000/api';

const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' }; // owner

async function signIn(creds) {
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword(creds);
  if (error) throw error;
  return { token: data.session.access_token };
}

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const results = [];
function record(name, pass) { results.push({ name, pass }); console.log(pass ? `PASS: ${name}` : `FAIL: ${name}`); }

async function makeAdHocUser(admin, label) {
  const email = `m9${label}+${Date.now()}@kapitpondo.test`;
  await admin.auth.admin.createUser({ email, password: 'AdHoc123!', email_confirm: true });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signedIn } = await anon.auth.signInWithPassword({ email, password: 'AdHoc123!' });
  const { data: memberRow } = await admin.from('members').select('id').eq('auth_id', signedIn.user.id).single();
  return { token: signedIn.session.access_token, memberId: memberRow.id };
}

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const adminToken = await signIn({ email: 'e2e.admin@kapitpondo.test', password: 'KapitE2E_Admin1!' }).then(x => x.token);
  const a = await signIn(MEMBER_A); // owner

  console.log('--- create ad-hoc Auditor and an Unverified member ---');
  const auditor = await makeAdHocUser(admin, 'auditor');
  const unverified = await makeAdHocUser(admin, 'unverified'); // deliberately never verified

  console.log('\n--- Member A creates a group (owner) ---');
  let r = await call('POST', '/groups', a.token, { name: 'M9 Distribution Test Group', fund_code: `M9DIST-${Date.now()}` });
  const groupId = r.json.group.id;
  const fundCode = r.json.group.fund_code;

  console.log('\n--- Auditor joins + verified + role set ---');
  r = await call('POST', '/groups/join-by-code', auditor.token, { fund_code: fundCode });
  await call('PATCH', `/groups/${groupId}/members/${auditor.memberId}/approve`, a.token);
  await call('POST', '/me/identity', auditor.token, { id_document_url: `kyc/m9aud-${Date.now()}.jpg`, id_type: 'national_id' });
  await call('POST', `/admin/verifications/${auditor.memberId}/approve`, adminToken);
  await call('PATCH', `/groups/${groupId}/members/${auditor.memberId}/role`, a.token, { role: 'auditor' });

  console.log('\n--- Unverified member joins (stays Unverified — TC-038 subject) ---');
  r = await call('POST', '/groups/join-by-code', unverified.token, { fund_code: fundCode });
  await call('PATCH', `/groups/${groupId}/members/${unverified.memberId}/approve`, a.token);
  r = await call('GET', `/groups/${groupId}/members`, a.token);
  const unverifiedMembership = r.json.members.find((m) => m.member_id === unverified.memberId);
  console.log('unverified member verification_status:', unverifiedMembership.members.verification_status);

  console.log('\n--- fund the group via a ledger adjustment ---');
  await call('POST', `/groups/${groupId}/ledger/adjustment`, a.token, { direction: 'credit', amount: 3000, reason: 'Seed funding for M9 test' });

  console.log('\n--- Owner previews the distribution ---');
  r = await call('POST', `/groups/${groupId}/distributions/preview`, a.token, { period: '2026' });
  console.log(r.status, JSON.stringify(r.json.distribution), '\nallocations:', JSON.stringify(r.json.allocations, null, 2));
  const distId = r.json.distribution.id;

  console.log('\n=== TC-038: Unverified member IS included in the payout ===');
  const unverifiedAlloc = r.json.allocations.find((al) => al.memberships?.member_id === unverified.memberId);
  record('Unverified member received a proportional allocation', !!unverifiedAlloc && Number(unverifiedAlloc.amount) > 0);

  console.log('\n=== TC-015: Owner cannot finalize before Auditor verification ===');
  r = await call('POST', `/groups/${groupId}/distributions/${distId}/finalize`, a.token);
  console.log(r.status, JSON.stringify(r.json));
  record('Finalize blocked before verification', r.status === 409);

  console.log('\n--- Treasurer/other roles cannot verify (auditor-only) ---');
  r = await call('POST', `/groups/${groupId}/distributions/${distId}/verify`, a.token, {}); // Owner tries, should fail (not auditor)
  record('Owner cannot verify (auditor-only gate)', r.status === 403);

  console.log('\n=== TC-027: Auditor verifies ===');
  r = await call('POST', `/groups/${groupId}/distributions/${distId}/verify`, auditor.token, { notes: 'Cross-checked against ledger — matches' });
  console.log(r.status, JSON.stringify(r.json));
  record('Auditor verifies -> status verified', r.status === 200 && r.json.distribution.status === 'verified');

  console.log('\n--- Owner finalizes (now allowed) ---');
  r = await call('POST', `/groups/${groupId}/distributions/${distId}/finalize`, a.token);
  console.log(r.status, JSON.stringify(r.json));
  record('Owner finalizes successfully after verification', r.status === 200 && r.json.distribution.status === 'finalized');

  console.log('\n--- confirm the unverified member actually got a ledger-posted payout ---');
  r = await call('GET', `/groups/${groupId}/distributions/${distId}`, a.token);
  const finalAlloc = r.json.allocations.find((al) => al.memberships?.member_id === unverified.memberId);
  record('Unverified member\'s allocation has a real ledger entry (actually paid)', !!finalAlloc?.ledger_entry_id);

  console.log('\n=== Summary ===');
  const failed = results.filter((x) => !x.pass);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
