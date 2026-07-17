// Live verification of TC-018: an officer (here, Owner Member A) records a
// contribution on behalf of another member (Member B) — and confirms a
// regular member CANNOT record on behalf of someone else (negative case).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API = 'http://localhost:4000/api';

const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' }; // verified, will be owner
const MEMBER_B = { email: 'e2e.memberb@kapitpondo.test', password: 'KapitE2E_MemberB1!' };

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

  console.log('--- Member A creates a group (owner) ---');
  let r = await call('POST', '/groups', a.token, { name: 'M5 On-Behalf Test Group', fund_code: `M5OB-${Date.now()}` });
  console.log(r.status, r.json.group?.fund_code ?? r.json);
  const groupId = r.json.group.id;
  const fundCode = r.json.group.fund_code;

  console.log('\n--- Member B joins + Member A approves ---');
  r = await call('POST', '/groups/join-by-code', b.token, { fund_code: fundCode });
  const memberBId = r.json.membership.member_id;
  r = await call('PATCH', `/groups/${groupId}/members/${memberBId}/approve`, a.token);
  console.log('Member B membership status:', r.json.membership?.status);

  console.log('\n--- fetch Member B\'s membership_id (via group members list) ---');
  r = await call('GET', `/groups/${groupId}/members`, a.token);
  const memberBMembership = r.json.members.find((m) => m.member_id === memberBId);
  const memberBMembershipId = memberBMembership.id;
  console.log('membership_id:', memberBMembershipId);

  console.log('\n--- Member A creates a cycle (needed for cycle_id) ---');
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, {
    name: 'Test Cycle', contribution_amount: '1000.00', start_date: '2026-01-01',
  });
  const cycleId = r.json.cycle.id;
  console.log('cycle status:', r.json.cycle.status);

  console.log('\n--- Member A (owner/officer) records a contribution ON BEHALF of Member B ---');
  r = await call('POST', `/groups/${groupId}/contributions`, a.token, {
    cycle_id: cycleId,
    amount: 1000,
    membership_id: memberBMembershipId,
    payment_method: 'gcash',
    external_reference: 'OR-2201',
  });
  console.log(r.status, JSON.stringify(r.json.contribution, null, 2));
  const pass1 =
    r.status === 201 &&
    r.json.contribution.membership_id === memberBMembershipId; // attributed to B
  console.log(pass1 ? 'PASS: contribution attributed to Member B, recorded by Member A' : 'FAIL');

  console.log('\n--- negative case: Member B (regular member) tries to record for someone else (Member A\'s own membership) ---');
  r = await call('GET', `/groups/${groupId}/members`, a.token);
  const memberAMembershipId = r.json.members.find((m) => m.role === 'owner').id;
  r = await call('POST', `/groups/${groupId}/contributions`, b.token, {
    cycle_id: cycleId,
    amount: 1000,
    membership_id: memberAMembershipId,
  });
  console.log(r.status, r.json);
  const pass2 = r.status === 403;
  console.log(pass2 ? 'PASS: non-officer blocked from recording for someone else' : 'FAIL');

  process.exit(pass1 && pass2 ? 0 : 1);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
