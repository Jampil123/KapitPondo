// Live verification of M4 fixes:
//   TC-011: cycle creation captures due day / interest / min loan / early-
//           termination penalty, and becomes Active on a single "Save".
//   TC-012: a second cycle created while one is active goes to draft/Setup
//           instead of erroring; explicitly activating it is still blocked.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API = 'http://localhost:4000/api';

const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' };

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

  console.log('--- verify Member A is actually verified (owner precondition) ---');
  let r = await call('GET', '/me/profile', a.token);
  console.log('verification_status:', r.json.member.verification_status);
  if (r.json.member.verification_status !== 'verified') {
    console.log('ABORT: run the officer-gate script first, or approve Member A manually.');
    process.exit(1);
  }

  console.log('\n--- Member A creates a group (owner) ---');
  r = await call('POST', '/groups', a.token, { name: 'M4 Cycle Test Group', fund_code: `M4TEST-${Date.now()}` });
  const groupId = r.json.group.id;
  console.log(r.status, groupId);

  console.log('\n--- TC-011: create the first cycle with all fields ---');
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, {
    name: 'Jan 2026 - Dec 2026',
    contribution_amount: '1000.00',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    penalty_amount: '100.00',
    penalty_type: 'fixed',
    contribution_due_day: 5,
    default_interest_rate: '0.03',
    minimum_loan_amount: '1000.00',
    early_termination_penalty: '500.00',
  });
  console.log(r.status, JSON.stringify(r.json.cycle, null, 2));
  const cycle1 = r.json.cycle;
  const pass011 =
    r.status === 201 &&
    cycle1.status === 'active' &&
    cycle1.contribution_due_day === 5 &&
    Number(cycle1.default_interest_rate) === 0.03 &&
    Number(cycle1.minimum_loan_amount) === 1000 &&
    Number(cycle1.early_termination_penalty) === 500;
  console.log(pass011 ? 'TC-011 PASS: single save -> Active, all fields captured' : 'TC-011 FAIL');

  console.log('\n--- TC-012: create a second cycle while the first is active ---');
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, {
    name: 'Second cycle (should be Setup, not Active)',
    contribution_amount: '1000.00',
    start_date: '2027-01-01',
  });
  console.log(r.status, 'status:', r.json.cycle?.status);
  const cycle2 = r.json.cycle;
  const pass012a = r.status === 201 && cycle2.status === 'draft';
  console.log(pass012a ? 'TC-012a PASS: second cycle forced into Setup/draft, not errored' : 'TC-012a FAIL');

  console.log('\n--- TC-012: explicitly activating the second (draft) cycle is still blocked ---');
  r = await call('POST', `/groups/${groupId}/cycles/${cycle2.id}/activate`, a.token);
  console.log(r.status, r.json);
  const pass012b = r.status === 409;
  console.log(pass012b ? 'TC-012b PASS: explicit activation blocked (one-active-cycle rule enforced)' : 'TC-012b FAIL');

  process.exit(pass011 && pass012a && pass012b ? 0 : 1);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
