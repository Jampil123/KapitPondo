// Live verification of:
//   TC-025: contribution rejection stores + surfaces a reason.
//   TC-039: a missed contribution past its due day auto-flags Late and
//           charges a penalty (detected lazily when an officer views
//           contributions — no cron in this stack).
//   TC-017: the Owner waives that penalty with a reason.
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
  let r = await call('POST', '/groups', a.token, { name: 'M5 Penalty+Reject Test Group', fund_code: `M5PEN-${Date.now()}` });
  const groupId = r.json.group.id;
  const fundCode = r.json.group.fund_code;
  console.log(r.status, groupId);

  console.log('\n--- Member B joins + Member A approves ---');
  r = await call('POST', '/groups/join-by-code', b.token, { fund_code: fundCode });
  const memberBId = r.json.membership.member_id;
  await call('PATCH', `/groups/${groupId}/members/${memberBId}/approve`, a.token);

  console.log('\n=== TC-025: reject with a reason ===');
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, {
    name: 'Reject Test Cycle', contribution_amount: '1000.00', start_date: '2026-01-01',
  });
  const cycleForReject = r.json.cycle.id;
  r = await call('POST', `/groups/${groupId}/contributions`, b.token, { cycle_id: cycleForReject, amount: 1000 });
  const contribId = r.json.contribution.id;
  r = await call('POST', `/groups/${groupId}/contributions/${contribId}/reject`, a.token, {
    reason: 'Proof shows PHP 800, submission states PHP 1,000',
  });
  console.log(r.status, JSON.stringify(r.json.contribution, null, 2));
  const pass025 = r.status === 200 && r.json.contribution.rejection_reason === 'Proof shows PHP 800, submission states PHP 1,000';
  console.log(pass025 ? 'TC-025 PASS' : 'TC-025 FAIL');

  console.log('\n=== TC-039 + TC-017: late penalty detection + waive ===');
  console.log('--- Member A closes the reject-test cycle so it doesn\'t interfere, then creates a new cycle due on the 1st (already overdue this month) ---');
  await call('POST', `/groups/${groupId}/cycles/${cycleForReject}/close`, a.token);
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, {
    name: 'Late Penalty Test Cycle',
    contribution_amount: '1000.00',
    start_date: '2026-01-01',
    penalty_amount: '100.00',
    contribution_due_day: 1, // definitely already past this month
  });
  console.log(r.status, 'cycle status:', r.json.cycle.status, 'due day:', r.json.cycle.contribution_due_day);

  console.log('\n--- Member B submits nothing. Officer views contributions -> should lazily trigger the late check ---');
  r = await call('GET', `/groups/${groupId}/contributions`, a.token);
  console.log('contributions status:', r.status);

  console.log('\n--- list penalties for the group ---');
  r = await call('GET', `/groups/${groupId}/penalties`, a.token);
  console.log(JSON.stringify(r.json.penalties, null, 2));
  const pendingPenalty = r.json.penalties?.find((p) => p.membership?.member_id === memberBId && p.status === 'pending');
  const pass039 = !!pendingPenalty && Number(pendingPenalty.amount) === 100;
  console.log(pass039 ? 'TC-039 PASS: penalty auto-charged for Member B' : 'TC-039 FAIL');

  if (pendingPenalty) {
    console.log('\n--- Owner waives the penalty with a reason ---');
    r = await call('POST', `/groups/${groupId}/penalties/${pendingPenalty.id}/waive`, a.token, {
      reason: 'Bank delay, proof provided',
    });
    console.log(r.status, JSON.stringify(r.json.penalty, null, 2));
    const pass017 = r.status === 200 && r.json.penalty.status === 'waived' && r.json.penalty.waive_reason === 'Bank delay, proof provided';
    console.log(pass017 ? 'TC-017 PASS: penalty waived with reason' : 'TC-017 FAIL');
    process.exit(pass025 && pass039 && pass017 ? 0 : 1);
  } else {
    process.exit(1);
  }
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
