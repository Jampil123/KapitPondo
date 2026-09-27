// services/api/scripts/e2e-test.js
// KapitPondo — Full lifecycle end-to-end test
//
// Prerequisites (do this once before running):
//   1. Pre-create 3 Supabase Auth users and fill in CONFIG below.
//   2. Add the Admin to `platform_admins` (seed-test-users.js does this).
//   3. Start the backend:  node services/api/server.ts  (or however you run it)
//   4. Run:  node services/api/scripts/e2e-test.js
//
// Members A & B do NOT need to be verified ahead of time — the script
// submits their identity docs and has the admin approve them in Steps 1–2.

'use strict';

// ─────────────────────────────────────────────────────────────
// CONFIG — fill in your values
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://tnecppmzzuaticisnrsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZWNwcG16enVhdGljaXNucnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDMyOTYsImV4cCI6MjA5NzYxOTI5Nn0.zJuJIpV1H7kolJXxXaR5ZsULVc-4fEwOltICSli513A';
const API_BASE          = 'http://localhost:4000';

const ADMIN    = { email: 'e2e.admin@kapitpondo.test',   password: 'KapitE2E_Admin1!' };
const MEMBER_A = { email: 'e2e.membera@kapitpondo.test', password: 'KapitE2E_MemberA1!' };
const MEMBER_B = { email: 'e2e.memberb@kapitpondo.test', password: 'KapitE2E_MemberB1!' };
// ─────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────

async function signIn({ email, password }) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Sign-in failed for ${email}: ${res.status} ${txt}`);
  }
  return (await res.json()).access_token;
}

async function api(method, path, token, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${txt}`);
  }
  return res.json();
}

let stepNum = 0;

function pass(desc) {
  console.log(`✓ Step ${++stepNum}: ${desc}`);
}

function bail(desc, err) {
  console.error(`✗ Step ${++stepNum}: ${desc}`);
  console.error(`  Error: ${err.message}`);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('=== KapitPondo E2E Lifecycle Test ===\n');

  // ── Step 1: Sign in as all 3 users; get member profiles ────────────────────

  let adminTok, aTok, bTok;
  try {
    [adminTok, aTok, bTok] = await Promise.all([
      signIn(ADMIN),
      signIn(MEMBER_A),
      signIn(MEMBER_B),
    ]);
  } catch (err) { bail('Sign in as Admin, Member A, Member B', err); }

  let admin, memberA, memberB;
  try {
    [{ member: admin }, { member: memberA }, { member: memberB }] = await Promise.all([
      api('GET', '/api/me/profile', adminTok),
      api('GET', '/api/me/profile', aTok),
      api('GET', '/api/me/profile', bTok),
    ]);
    pass(
      `Signed in — Admin(${admin.id.slice(0, 8)}…) ` +
      `A(${memberA.id.slice(0, 8)}…) B(${memberB.id.slice(0, 8)}…)`
    );
  } catch (err) { bail('Sign in as Admin, Member A, Member B and fetch profiles', err); }

  // Members A & B submit identity documents → puts them in 'pending' queue.
  // Silently ignored if they were already submitted or are already verified.
  try {
    await Promise.all([
      api('POST', '/api/me/identity', aTok, {
        id_document_url: 'https://example.com/id-member-a.jpg',
        full_name: 'Alice Tester',
        phone: '09100000001',
      }),
      api('POST', '/api/me/identity', bTok, {
        id_document_url: 'https://example.com/id-member-b.jpg',
        full_name: 'Bob Tester',
        phone: '09100000002',
      }),
    ]);
  } catch (_) {
    console.log('  (Identity docs already submitted or members already verified — skipping)');
  }

  // ── Step 2: Admin lists the verification queue; approves A & B ─────────────

  try {
    const { members: queue } = await api('GET', '/api/admin/verifications', adminTok);
    console.log(`  Verification queue: ${queue.length} pending member(s)`);

    const qA = queue.find(m => m.email === MEMBER_A.email);
    const qB = queue.find(m => m.email === MEMBER_B.email);

    if (!qA) throw new Error(
      `Member A (${MEMBER_A.email}) not found in verification queue. ` +
      `Ensure their verification_status is 'pending'.`
    );
    if (!qB) throw new Error(
      `Member B (${MEMBER_B.email}) not found in verification queue. ` +
      `Ensure their verification_status is 'pending'.`
    );

    await Promise.all([
      api('POST', `/api/admin/verifications/${qA.id}/approve`, adminTok),
      api('POST', `/api/admin/verifications/${qB.id}/approve`, adminTok),
    ]);
    pass('Admin listed the verification queue and approved Member A and Member B');
  } catch (err) { bail('Admin list verification queue and approve A & B', err); }

  // ── Step 3: Member A creates a group (becomes owner) ───────────────────────

  let group, memberAMship;
  try {
    const { group: g } = await api('POST', '/api/groups', aTok, {
      name: 'E2E Savings Circle',
      fund_code: `E2E${Date.now()}`,
      description: 'Automated end-to-end test group',
    });
    group = g;

    // A's owner membership is created automatically; fetch its ID now.
    const { memberships } = await api('GET', `/api/groups/${group.id}/memberships`, aTok);
    memberAMship = memberships.find(m => m.member_id === memberA.id);
    if (!memberAMship) throw new Error("Owner membership for Member A not found after group creation");

    console.log(`  Group ID: ${group.id}  |  A membership: ${memberAMship.id}`);
    pass('Member A created a group — A is owner');
  } catch (err) { bail('Member A create group', err); }

  // ── Step 4: B requests to join; A approves B's membership ──────────────────

  let memberBMship;
  try {
    const { membership: pending } = await api('POST', `/api/groups/${group.id}/join`, bTok);
    memberBMship = pending;
    console.log(`  B pending membership: ${memberBMship.id}`);

    const { membership: approved } = await api(
      'POST', `/api/groups/${group.id}/memberships/${memberBMship.id}/approve`, aTok
    );
    memberBMship = approved;
    pass("Member B requested to join; Member A (owner) approved B's membership");
  } catch (err) { bail("Member B join request and Member A approve", err); }

  // ── Step 5: Set B's role to treasurer; set B's heads to 2 ─────────────────

  try {
    await api(
      'PATCH', `/api/groups/${group.id}/memberships/${memberBMship.id}/role`, aTok,
      { role: 'treasurer' }
    );
    await api(
      'PATCH', `/api/groups/${group.id}/memberships/${memberBMship.id}/heads`, aTok,
      { heads: 2 }
    );
    pass("Owner set Member B's role to treasurer and heads to 2");
  } catch (err) { bail("Set Member B's role and heads", err); }

  // ── Step 6: Owner creates a cycle and activates it ─────────────────────────

  let cycle;
  try {
    const { cycle: draft } = await api('POST', `/api/groups/${group.id}/cycles`, aTok, {
      name: 'E2E Cycle 2026',
      contribution_amount: 500,
      start_date: new Date().toISOString().slice(0, 10),
      frequency: 'monthly',
    });

    const { cycle: active } = await api(
      'POST', `/api/groups/${group.id}/cycles/${draft.id}/activate`, aTok
    );
    cycle = active;
    console.log(`  Cycle ID: ${cycle.id}  |  status: ${cycle.status}`);
    pass('Owner created a cycle and activated it');
  } catch (err) { bail('Owner create and activate cycle', err); }

  // ── Step 7: A submits contribution; B (treasurer) approves; verify ledger ──

  try {
    const { contribution: contribA } = await api(
      'POST', `/api/groups/${group.id}/contributions`, aTok,
      { cycle_id: cycle.id, amount: 500, payment_method: 'gcash' }
    );
    console.log(`  A's contribution ID: ${contribA.id}`);

    // B is treasurer and recorded_by ≠ B  →  segregation satisfied
    const { ledgerEntry } = await api(
      'POST', `/api/groups/${group.id}/contributions/${contribA.id}/approve`, bTok
    );
    if (!ledgerEntry) throw new Error('Approval returned no ledger entry');
    console.log(`  Ledger entry from A's contribution: ${JSON.stringify(ledgerEntry)}`);

    pass("Member A submitted contribution; Member B (treasurer) approved it — ledger entry created");
  } catch (err) { bail("A submit contribution, B (treasurer) approve, verify ledger", err); }

  // ── Step 8: B submits contribution; A (owner) approves ─────────────────────
  // Segregation: B recorded it → approver must be someone else; A (owner) qualifies.

  try {
    const { contribution: contribB } = await api(
      'POST', `/api/groups/${group.id}/contributions`, bTok,
      { cycle_id: cycle.id, amount: 1000, payment_method: 'gcash' }  // 2 heads × 500
    );
    console.log(`  B's contribution ID: ${contribB.id}`);

    // A is owner, and A ≠ B (the recorder) → segregation satisfied
    await api(
      'POST', `/api/groups/${group.id}/contributions/${contribB.id}/approve`, aTok
    );
    pass(
      "Member B submitted contribution; Member A (owner) approved it " +
      "(segregation: recorder B ≠ approver A)"
    );
  } catch (err) { bail("B submit contribution, A (owner) approve (segregation)", err); }

  // ── Step 9: A applies for loan; B checks liquidity; B approves ─────────────

  let loan;
  try {
    const { loan: applied } = await api('POST', `/api/groups/${group.id}/loans`, aTok, {
      principal: 300,
      term_months: 3,
      purpose: 'E2E test loan',
    });
    loan = applied;
    console.log(`  Loan ID: ${loan.id}  |  principal: ${loan.principal}`);

    const { available_cash } = await api('GET', `/api/groups/${group.id}/liquidity`, bTok);
    console.log(`  Available cash before approval: ${available_cash}`);

    // B's membership_id ≠ A's membership_id  →  no self-approval
    await api(
      'POST', `/api/groups/${group.id}/loans/${loan.id}/approve`, bTok,
      { interest_rate: 0.02 }   // 2 % monthly
    );
    pass(
      `Member A applied for loan (300); B checked liquidity (${available_cash}); ` +
      `B (treasurer) approved at 2% monthly`
    );
  } catch (err) { bail("A apply loan, B check liquidity, B approve loan", err); }

  // ── Step 10: B records repayment; A is the approver ────────────────────────
  // Segregation: recorded_by = B → approver must differ; A's member.id is passed.

  try {
    await api(
      'POST', `/api/groups/${group.id}/loans/${loan.id}/repayments`, bTok,
      {
        amount: 106,                 // ≈ one monthly instalment at 2 %
        payment_method: 'gcash',
        approver_id: memberA.id,     // A ≠ B → satisfies SQL segregation check
      }
    );
    pass(
      "Member B (treasurer) recorded loan repayment with Member A as approver " +
      "(segregation: recorder B ≠ approver A)"
    );
  } catch (err) { bail("B record loan repayment (A as approver)", err); }

  // ── Step 12: Owner fetches group summary report and member balances ─────────

  try {
    const { summary } = await api(
      'GET', `/api/groups/${group.id}/reports/summary`, aTok
    );
    console.log('\n  ── Group Summary Report ──');
    console.log(JSON.stringify(summary, null, 4).replace(/^/gm, '  '));

    const { balances } = await api(
      'GET', `/api/groups/${group.id}/reports/member-balances`, aTok
    );
    console.log('\n  ── Member Balances ──');
    for (const b of balances) {
      console.log(
        `  ${(b.full_name ?? b.membership_id).padEnd(20)} ` +
        `role: ${b.role.padEnd(10)} heads: ${b.heads}  balance: ${b.balance}`
      );
    }

    pass('Owner fetched group summary report and member balances');
  } catch (err) { bail('Owner fetch group summary and member balances', err); }

  // ── Step 13: Preview distribution; print allocations; finalize; assert cash=0

  let distribution;
  try {
    const { distribution: prev, allocations } = await api(
      'POST', `/api/groups/${group.id}/distributions/preview`, aTok,
      { period: '2026' }
    );
    distribution = prev;

    console.log('\n  ── Year-End Distribution Preview ──');
    console.log(`  Distribution ID : ${distribution.id}`);
    console.log(`  Total amount    : ${distribution.total_amount}`);
    for (const a of allocations) {
      const name = a.memberships?.members?.full_name ?? a.membership_id;
      console.log(`  ${String(name).padEnd(20)} allocation: ${a.amount}`);
    }

    await api(
      'POST', `/api/groups/${group.id}/distributions/${distribution.id}/finalize`, aTok
    );

    // Assert available_cash === 0 after finalization
    const { available_cash } = await api('GET', `/api/groups/${group.id}/liquidity`, bTok);
    const cash = Number(available_cash);
    if (cash !== 0) {
      bail(
        'Assert available_cash === 0 after distribution finalized',
        new Error(`Expected 0, got ${cash}  [FAIL]`)
      );
    }
    pass(
      `Owner previewed and finalized year-end distribution — ` +
      `available_cash is ${cash}  [PASS]`
    );
  } catch (err) { bail('Preview, finalize distribution; assert available_cash === 0', err); }

  // ── Step 14: System Admin fetches the monitoring platform overview ──────────

  try {
    const { overview } = await api('GET', '/api/admin/monitoring/overview', adminTok);
    console.log('\n  ── Platform Monitoring Overview ──');
    console.log(JSON.stringify(overview, null, 4).replace(/^/gm, '  '));
    pass('System Admin fetched the platform monitoring overview');
  } catch (err) { bail('Admin fetch monitoring overview', err); }

  // ── Done ────────────────────────────────────────────────────────────────────

  console.log('\n=== ALL STEPS PASSED ===\n');
}

main().catch(err => {
  console.error('\nFatal (uncaught):', err.message);
  process.exit(1);
});
