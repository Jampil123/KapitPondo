// Live verification of TC-010: an unverified member cannot be appointed
// Treasurer/Auditor. Freshly seeded accounts: Member A gets verified first
// (needed to pass the create-group gate and act as owner); Member B is left
// unverified throughout — that's the one we try to appoint as an officer.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API = 'http://localhost:4000/api';

const ADMIN = { email: 'e2e.admin@kapitpondo.test', password: 'KapitE2E_Admin1!' };
const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' };
const MEMBER_B = { email: 'e2e.memberb@kapitpondo.test', password: 'KapitE2E_MemberB1!' }; // must stay unverified

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

async function main() {
  const a = await signIn(MEMBER_A);
  const b = await signIn(MEMBER_B);
  const admin = await signIn(ADMIN);

  console.log('--- verify Member A first (needed to create a group) ---');
  let r = await call('GET', '/me/profile', a.token);
  const memberAId = r.json.member.id;
  await call('POST', '/me/identity', a.token, { id_document_url: `kyc/setup-a-${Date.now()}.jpg`, id_type: 'national_id' });
  r = await call('POST', `/admin/verifications/${memberAId}/approve`, admin.token);
  console.log('Member A verification_status:', r.json.member?.verification_status);

  console.log('\n--- confirm Member B is unverified ---');
  r = await call('GET', '/me/profile', b.token);
  const memberBId = r.json.member.id;
  console.log('Member B verification_status:', r.json.member.verification_status);
  if (r.json.member.verification_status !== 'unverified') {
    console.log('ABORT: Member B is not unverified — test setup invalid.');
    process.exit(1);
  }

  console.log('\n--- Member A creates a group (owner) ---');
  r = await call('POST', '/groups', a.token, { name: 'M3 Officer Gate Test Group', fund_code: `M3TEST-${Date.now()}` });
  console.log(r.status, r.json.group ? 'group created' : r.json);
  const groupId = r.json.group.id;

  console.log('\n--- Member B (unverified) joins by fund code ---');
  r = await call('POST', '/groups/join-by-code', b.token, { fund_code: r.json.group?.fund_code });
  console.log(r.status, r.json.membership?.status);

  console.log('\n--- Member A approves Member B\'s join request (still unverified) ---');
  r = await call('PATCH', `/groups/${groupId}/members/${memberBId}/approve`, a.token);
  console.log(r.status, r.json.membership?.status);

  console.log('\n--- Member A attempts to appoint (unverified) Member B as Treasurer ---');
  r = await call('PATCH', `/groups/${groupId}/members/${memberBId}/role`, a.token, { role: 'treasurer' });
  console.log(r.status, r.json);
  console.log(r.status === 409 ? '\nPASS: appointment correctly blocked' : '\nFAIL: appointment was NOT blocked');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
