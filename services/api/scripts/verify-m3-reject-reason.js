// Live verification of TC-008: Owner rejects a join request with a reason —
// the membership row should keep status 'rejected' + the reason (not be
// deleted), and the same member should be able to rejoin afterward (the
// (member_id, group_id) unique constraint means a stale 'rejected' row must
// be revived, not just re-inserted — see joinByCode's fix in groups.service.js).
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API = 'http://localhost:4000/api';

const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' }; // verified, owner
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
  let r = await call('POST', '/groups', a.token, { name: 'M3 Reject Reason Test Group', fund_code: `M3REJ-${Date.now()}` });
  console.log(r.status, r.json.group ? 'group created' : r.json);
  const groupId = r.json.group.id;
  const fundCode = r.json.group.fund_code;

  console.log('\n--- Member B joins by fund code ---');
  r = await call('POST', '/groups/join-by-code', b.token, { fund_code: fundCode });
  console.log(r.status, r.json.membership?.status);
  const memberBId = r.json.membership.member_id;

  console.log('\n--- Member A rejects with a reason ---');
  r = await call('PATCH', `/groups/${groupId}/members/${memberBId}/reject`, a.token, {
    reason: 'Group already at target size for this cycle',
  });
  console.log(r.status, JSON.stringify(r.json));

  console.log('\n--- confirm membership row: status + reason retained (not deleted) ---');
  r = await call('GET', `/groups/${groupId}/members/pending`, a.token);
  console.log('still in pending list?', r.json.members?.some((m) => m.member_id === memberBId));

  console.log('\n--- Member B tries to rejoin the same group (should work, not "already a member") ---');
  r = await call('POST', '/groups/join-by-code', b.token, { fund_code: fundCode });
  console.log(r.status, r.json.membership?.status ?? r.json.error);
  console.log(r.status === 201 && r.json.membership?.status === 'pending' ? '\nPASS: rejoin works after rejection' : '\nFAIL: rejoin blocked or broken');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
