// Live verification of M6 lending fixes:
//   TC-013/019: Owner approves (decision only) -> Treasurer disburses (separate
//               step); Treasurer alone cannot approve.
//   TC-014:     Owner's approve attempt is blocked when the borrower has a
//               missed contribution on file; Owner then rejects with a reason.
//   TC-034:     a verified member's application is accepted.
//   TC-035:     an unverified member is blocked server-side from applying.
//   TC-040:     insufficient liquidity allows a PARTIAL approval instead of
//               only being blocked outright.
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const SUPABASE_URL = 'https://tnecppmzzuaticisnrsd.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'http://localhost:4000/api';

const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' }; // owner
const MEMBER_B = { email: 'e2e.memberb@kapitpondo.test', password: 'KapitE2E_MemberB1!' }; // treasurer + borrower

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

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const a = await signIn(MEMBER_A);
  const b = await signIn(MEMBER_B);

  console.log('--- Member A creates a group (owner) ---');
  let r = await call('POST', '/groups', a.token, { name: 'M6 Lending Test Group', fund_code: `M6LEND-${Date.now()}` });
  const groupId = r.json.group.id;
  const fundCode = r.json.group.fund_code;

  console.log('\n--- Member B joins, gets verified, approved, promoted to Treasurer ---');
  r = await call('POST', '/groups/join-by-code', b.token, { fund_code: fundCode });
  const memberBId = r.json.membership.member_id;
  await call('PATCH', `/groups/${groupId}/members/${memberBId}/approve`, a.token);
  await call('POST', '/me/identity', b.token, { id_document_url: `kyc/m6-${Date.now()}.jpg`, id_type: 'national_id' });
  await call('POST', `/admin/verifications/${memberBId}/approve`, await signIn({ email: 'e2e.admin@kapitpondo.test', password: 'KapitE2E_Admin1!' }).then(x => x.token));
  await call('PATCH', `/groups/${groupId}/members/${memberBId}/role`, a.token, { role: 'treasurer' });

  console.log('\n--- fund the group: Member B contributes, Member A approves (cash inflow) ---');
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, { name: 'Cash Cycle', contribution_amount: '5000.00', start_date: '2026-01-01' });
  const cycleId = r.json.cycle.id;
  r = await call('POST', `/groups/${groupId}/contributions`, b.token, { cycle_id: cycleId, amount: 5000 });
  const contribId = r.json.contribution.id;
  await call('POST', `/groups/${groupId}/contributions/${contribId}/approve`, a.token);
  r = await call('GET', `/groups/${groupId}/liquidity`, a.token);
  console.log('available cash:', r.json.available_cash);

  console.log('\n=== TC-035: unverified member cannot apply (server-side) ===');
  const throwaway = `m6throwaway+${Date.now()}@kapitpondo.test`;
  const { data: created } = await admin.auth.admin.createUser({ email: throwaway, password: 'Throwaway123!', email_confirm: true });
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signedIn } = await anon.auth.signInWithPassword({ email: throwaway, password: 'Throwaway123!' });
  const throwawayToken = signedIn.session.access_token;
  await call('POST', '/groups/join-by-code', throwawayToken, { fund_code: fundCode });
  const { data: tmember } = await admin.from('members').select('id').eq('auth_id', signedIn.user.id).single();
  await call('PATCH', `/groups/${groupId}/members/${tmember.id}/approve`, a.token);
  r = await call('POST', `/groups/${groupId}/loans`, throwawayToken, { principal: 1000, term_months: 3 });
  record('TC-035 unverified blocked from applying', r.status === 403);

  console.log('\n=== TC-034: verified member (B) applies successfully ===');
  r = await call('POST', `/groups/${groupId}/loans`, b.token, { principal: 3000, term_months: 6, purpose: 'Small business restock' });
  record('TC-034 verified member application accepted', r.status === 201 && r.json.loan.status === 'pending');
  const loanBId = r.json.loan.id;

  console.log('\n=== TC-013/019: Owner approves (decision only), Treasurer disburses separately ===');
  r = await call('POST', `/groups/${groupId}/loans/${loanBId}/approve`, b.token, { interest_rate: 0.03 });
  record('Treasurer alone CANNOT approve (wrong role)', r.status === 403);

  r = await call('POST', `/groups/${groupId}/loans/${loanBId}/approve`, a.token, { interest_rate: 0.03 });
  console.log(r.status, JSON.stringify(r.json));
  record('Owner approves -> status approved, not yet active', r.status === 200 && r.json.loan.status === 'approved');

  r = await call('GET', `/groups/${groupId}/loans/${loanBId}`, a.token);
  record('Loan still not active until disbursed', r.json.loan.status === 'approved' && r.json.loan.outstanding_balance == 0);

  r = await call('POST', `/groups/${groupId}/loans/${loanBId}/disburse`, b.token); // Treasurer disburses
  console.log(r.status, JSON.stringify(r.json));
  record('Treasurer disburses -> loan active', r.status === 200);

  r = await call('GET', `/groups/${groupId}/loans/${loanBId}`, a.token);
  record('Loan is now active with outstanding balance', r.json.loan.status === 'active' && Number(r.json.loan.outstanding_balance) === 3000);

  console.log('\n=== TC-014: Owner blocked from approving a loan with a missed contribution on file ===');
  console.log('--- force a late contribution for Member B via a due cycle ---');
  r = await call('POST', `/groups/${groupId}/cycles/${cycleId}/close`, a.token);
  r = await call('POST', `/groups/${groupId}/cycles`, a.token, {
    name: 'Late Cycle for M6', contribution_amount: '500.00', start_date: '2026-01-01', contribution_due_day: 1,
  });
  const lateCycleId = r.json.cycle.id;
  await call('GET', `/groups/${groupId}/contributions`, a.token); // triggers lazy late-check
  r = await call('GET', `/groups/${groupId}/penalties`, a.token);
  const bHasLate = r.json.penalties?.some((p) => p.membership?.member_id === memberBId);
  console.log('Member B has a late-flagged penalty:', bHasLate);

  r = await call('POST', `/groups/${groupId}/loans`, b.token, { principal: 1000, term_months: 3 });
  const loanB2Id = r.json.loan?.id;
  if (loanB2Id) {
    r = await call('GET', `/groups/${groupId}/loans/${loanB2Id}/eligibility`, a.token);
    console.log('eligibility:', JSON.stringify(r.json));
    record('Eligibility check flags the missed contribution', r.json.eligible === false && r.json.reasons.some((x) => /missed contribution/i.test(x)));

    r = await call('POST', `/groups/${groupId}/loans/${loanB2Id}/approve`, a.token, { interest_rate: 0.03 });
    record('Owner approve attempt blocked (ineligible)', r.status === 409);

    r = await call('POST', `/groups/${groupId}/loans/${loanB2Id}/reject`, a.token, { reason: 'Missed contribution on file' });
    record('Owner rejects with reason instead', r.status === 200 && r.json.loan.rejection_reason === 'Missed contribution on file');
  }

  console.log('\n=== TC-040: insufficient liquidity allows a PARTIAL approval ===');
  console.log('--- fresh group so no prior late-contribution/active-loan state leaks in: throwaway user owns it, Member A borrows ---');
  const adminToken2 = await signIn({ email: 'e2e.admin@kapitpondo.test', password: 'KapitE2E_Admin1!' }).then(x => x.token);
  await call('POST', '/me/identity', throwawayToken, { id_document_url: `kyc/throwaway-${Date.now()}.jpg`, id_type: 'national_id' });
  r = await call('POST', `/admin/verifications/${tmember.id}/approve`, adminToken2);
  console.log('throwaway verification approve:', r.status, r.json.member?.verification_status);

  r = await call('POST', '/groups', throwawayToken, { name: 'M6 Partial Approval Test Group', fund_code: `M6PART-${Date.now()}` });
  const freshGroupId = r.json.group.id;
  const freshFundCode = r.json.group.fund_code;
  r = await call('POST', '/groups/join-by-code', a.token, { fund_code: freshFundCode });
  const memberAInFreshGroupId = r.json.membership.member_id;
  await call('PATCH', `/groups/${freshGroupId}/members/${memberAInFreshGroupId}/approve`, throwawayToken);

  console.log('--- fund it with a small ledger adjustment (owner, no segregation constraint on adjustments) ---');
  await call('POST', `/groups/${freshGroupId}/ledger/adjustment`, throwawayToken, {
    direction: 'credit', amount: 2000, reason: 'Seed funding for TC-040 test',
  });
  r = await call('GET', `/groups/${freshGroupId}/liquidity`, throwawayToken);
  const cashNow = Number(r.json.available_cash);
  console.log('cash now:', cashNow);

  r = await call('POST', `/groups/${freshGroupId}/loans`, a.token, { principal: cashNow + 5000, term_months: 6 });
  console.log('loan application response:', r.status, JSON.stringify(r.json));
  const bigLoanId = r.json.loan.id;
  r = await call('POST', `/groups/${freshGroupId}/loans/${bigLoanId}/approve`, throwawayToken, { interest_rate: 0.03 });
  record('Full-amount approval blocked by liquidity', r.status === 409);

  const partial = Math.max(1, Math.floor(cashNow / 2));
  r = await call('POST', `/groups/${freshGroupId}/loans/${bigLoanId}/approve`, throwawayToken, { interest_rate: 0.03, approved_principal: partial });
  console.log(r.status, JSON.stringify(r.json));
  record('Partial approval within liquidity succeeds', r.status === 200 && Number(r.json.loan.approved_principal) === partial);

  console.log('\n=== Summary ===');
  const failed = results.filter((x) => !x.pass);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
