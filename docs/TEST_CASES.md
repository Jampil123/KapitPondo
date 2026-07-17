# KapitPondo — Backend API Test Case Document

Scope: `services/api` (Express + Supabase/Postgres). Covers every mounted route across all
15 modules (`groups`, `membership`, `identity`, `cycles`, `contributions`, `lending`,
`expenses`, `distribution`, `ledger`, `penalties`, `reporting`, `notifications`,
`monitoring`, `chat`, `adminSecurity`) plus the shared auth/role middleware.

## How to read this document

- **TC-008 → TC-040** are IDs already referenced in code comments and SQL migrations
  (e.g. `contributions.routes.js`, `migrations/0026_loan_approval_disbursement_split.sql`).
  They are reproduced here verbatim with the behavior they were originally written to pin
  down, so the numbering stays consistent with the codebase. Gaps in that range
  (TC-001–007, 009, 010, 016, 020, 022–024, 028–033, 036–037) belong to test cases that
  predate this document and could not be reconstructed from code alone — they are left
  unassigned rather than guessed at.
- **TC-041 and up** are new test cases covering endpoints/behavior with no prior TC-###
  citation in the codebase.
- **Type**: `Positive` (happy path), `Negative` (expected failure), or `Regression` (pins
  down a specific, already-observed behavior — including a few known defects/gaps called
  out explicitly as such, so they aren't "fixed" silently by a future change without
  someone noticing).
- **Execution**: There is no Jest/Mocha suite in this repo. Existing coverage is a set of
  hand-written Node scripts (`services/api/scripts/verify-m*.js`) that run against a live
  server + real Supabase project using seeded test accounts for each role (owner/admin,
  treasurer, member). These test cases are written to be executed the same way: either
  manually via an HTTP client (Postman/curl) against a running `services/api` instance, or
  turned into additional `verify-*.js` scripts following the existing pattern. Each test
  case assumes a seeded set of accounts covering: unverified member, verified member,
  treasurer, auditor, owner, and system admin (`members.is_system_admin = true`).

---

## 0. Shared auth & role middleware

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-041 | Negative | Missing Authorization header | Any endpoint behind `requireAuth` | Call endpoint with no `Authorization` header | 401 `Missing Authorization header` |
| TC-042 | Negative | Invalid/expired bearer token | — | Call with a malformed or expired token | 401 `Invalid or expired token` |
| TC-043 | Negative | Auth user with no linked `members` row | Supabase auth user exists but has no `members` row with matching `auth_id` | Call any authed endpoint | 403 `No member profile linked to this account` (not 401) |
| TC-044 | Positive | Active member with allowed role | Caller has an active membership with a role in the route's allow-list | Call the endpoint | 200 and expected payload |
| TC-045 | Negative | Pending membership treated as not-active | Caller's membership `status='pending'` | Call any group route | 403 `You are not an active member of this group.` |
| TC-046 | Regression | Suspended membership gives the same generic 403 as pending | Caller's membership `status='suspended'` | Call any group route | 403, identical message to TC-045 — confirms the API does not distinguish membership states in this error |
| TC-047 | Regression | Rejected membership gives the same generic 403 | Caller's membership `status='rejected'` | Call any group route | 403, identical message to TC-045/046 |
| TC-048 | Negative | Active member, role not in allow-list | Caller active but role excluded from route | Call the endpoint | 403 `Insufficient role for this action` |
| TC-049 | Negative | Non-sysadmin hitting a `requireSystemAdmin` route | `member.is_system_admin=false` | Call any `/api/admin/monitoring/*`, `/api/admin/verifications*`, or `/api/admin/security-questions` route | 403 `System administrator access required` |
| TC-050 | Positive | Sysadmin passes `requireSystemAdmin` | `member.is_system_admin=true` | Call same route | 200 |

---

## 1. Groups module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-051 | Positive | Verified member creates a group | Caller verified | `POST /groups {name, fund_code}` | 201; group created; caller becomes `owner` with active membership |
| TC-052 | Negative | Unverified member cannot create a group | Caller `verification_status != 'verified'` | `POST /groups` | 403 `Only verified members can create a group` |
| TC-053 | Negative | Missing required fields | — | `POST /groups {}` | 400 |
| TC-054 | Negative | Duplicate `fund_code` | A group with that code already exists | `POST /groups` with the same `fund_code` | 409 `That fund_code is already taken` |
| TC-055 | Positive | Join by code (case-insensitive) | Active group exists with a known `fund_code` | `POST /groups/join-by-code` with the code in a different case | Membership created as `pending` |
| TC-056 | Negative | Join by unknown/inactive code | — | `POST /groups/join-by-code` with a bogus code | 404 |
| TC-057 | Negative | Join by code while already pending/active/suspended | Caller already has a non-terminal membership in that group | `POST /groups/join-by-code` again | 409 `You are already a member of this group.` |
| TC-058 | Positive | Join by code revives a rejected/exited membership | Caller has a prior `rejected` or `exited` row for that group | `POST /groups/join-by-code` | Same row flipped back to `pending`; `rejection_reason` and `joined_at` cleared (no duplicate row) |
| TC-059 | Positive | List my groups includes pending applications | Caller has one active and one pending membership | `GET /groups` | Both groups returned |
| TC-060 | Positive | View group detail as active member | — | `GET /groups/:groupId` | 200 |
| TC-061 | Negative | View group detail as non-member | Caller has no membership in that group | `GET /groups/:groupId` | 403 |
| TC-062 | Positive | List pending applicants | Caller is owner/treasurer/auditor; ≥2 pending applicants exist | `GET /groups/:groupId/members/pending` | Returned oldest-first |
| TC-063 | Positive | Approve a pending applicant | Target membership `status='pending'` | `PATCH /groups/:groupId/members/:memberId/approve` | Status becomes `active` |
| TC-064 | Negative | Approve a non-pending row | Target already `active`/`rejected` | Same call | 404 |
| TC-008 | Regression | Reject preserves the membership row with a visible reason | Target membership `status='pending'` | `PATCH /groups/:groupId/members/:memberId/reject {reason}` | Row survives as `status='rejected'` with `rejection_reason` set (not hard-deleted); member notified `membership.rejected` |
| TC-065 | Negative | Reject a non-pending row | Target not pending | Same call | 404 |
| TC-066 | Positive | List officers (no PII) | — | `GET /groups/:groupId/officers` | Names + roles + member_count only; no email/phone |
| TC-067 | Positive | Member directory (no PII) | — | `GET /groups/:groupId/members/directory` | Name + role only |
| TC-068 | Positive | Full member list (officer only) | Caller is owner/treasurer/auditor | `GET /groups/:groupId/members` | Includes email + verification_status |
| TC-069 | Negative | Plain member cannot view full member list | Caller role = `member` | `GET /groups/:groupId/members` | 403 |
| TC-070 | Positive | Owner promotes a verified member to treasurer | Target `verification_status='verified'` | `PATCH /groups/:groupId/members/:memberId/role {role:'treasurer'}` | 200; role updated |
| TC-071 | Negative | Promote an unverified member to treasurer/auditor | Target unverified | Same call | 409 `Member must be verified before being appointed an officer` |
| TC-072 | Negative | Invalid role value | — | `PATCH .../role {role:'nonsense'}` | 400 |
| TC-073 | Regression | This endpoint refuses `role:'owner'` | — | `PATCH .../role {role:'owner'}` | 400 (owner not an accepted target here — contrast with TC-084) |
| TC-074 | Regression | Current owner's row cannot be touched via this endpoint | Target memberId belongs to the group's owner | `PATCH .../role` targeting the owner | Update is filtered out (`.neq('role','owner')`); owner's role unchanged |
| TC-075 | Positive | Owner removes a member | Target active, not the owner | `DELETE /groups/:groupId/members/:memberId` | Membership `status='exited'` |
| TC-076 | Regression | Attempting to remove the owner silently no-ops | Target is the group owner | `DELETE /groups/:groupId/members/:ownerMemberId` | No error returned, but owner's row is unchanged (no `.single()` check surfaces this) |

---

## 2. Membership module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-077 | Positive | Verified member joins directly by group id | Caller verified, no prior membership | `POST /groups/:groupId/join` | 201; `pending` membership created |
| TC-078 | Negative | Unverified member cannot join | — | `POST /groups/:groupId/join` | 403 `Only verified members can join a group` |
| TC-079 | Regression | Direct join does NOT revive a rejected/exited row | Caller has a prior `rejected`/`exited` membership in that group | `POST /groups/:groupId/join` | 409 (raw insert hits the unique constraint) — contrast with TC-058, where `join-by-code` revives the same situation instead of erroring |
| TC-080 | Positive | List memberships with status filter | Caller is officer | `GET /groups/:groupId/memberships?status=pending` | Filtered list incl. member contact info |
| TC-081 | Positive | Approve via memberships endpoint | Target `pending` | `POST /groups/:groupId/memberships/:id/approve` | `active`, `approved_by` set |
| TC-082 | Negative | Approve a non-pending membership | Target not pending | Same call | 404 |
| TC-083 | Negative | Invalid role on memberships role-change | — | `PATCH /groups/:groupId/memberships/:id/role {role:'bogus'}` | 400 `Invalid role` |
| TC-084 | Regression (defect) | Memberships role-change accepts `role:'owner'` with no protection | Caller is owner | `PATCH /groups/:groupId/memberships/:id/role {role:'owner'}` targeting another member | Succeeds — produces a second `owner` in the group, or can overwrite/demote the acting owner's own row. Unlike `groups.routes.js`'s equivalent endpoint (TC-073/074), there is no `.neq('role','owner')` guard here. Flag to dev team as an inconsistency/defect between the two role-change endpoints. |
| TC-085 | Negative | Promote to treasurer/auditor while unverified (memberships endpoint) | Target unverified | `PATCH .../role {role:'treasurer'}` | 409 `Member must be verified before being appointed an officer` |

---

## 3. Identity module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-086 | Regression (defect) | `GET /api/me/profile` is shadowed by the groups module | — | `GET /me/profile` | Response is `{member: req.member}` verbatim (groups' handler), with **no** `id_document_signed_url` key — proves identity's richer handler is unreachable because `groups.routes.js` is mounted first in `app.js` |
| TC-087 | Positive | Update personal profile fields | — | `PATCH /me/profile {first_name, last_name, region, ...}` | Only provided fields updated; `full_name` rebuilt from parts |
| TC-088 | Negative | Profile update cannot touch KYC/verification fields | — | `PATCH /me/profile {verification_status:'verified', id_document_url:'x'}` | Those fields are ignored/not persisted via this route |
| TC-089 | Positive | Submit identity documents | Caller `verification_status` is `unverified` | `POST /me/identity {id_document_url}` | `verification_status='pending'` |
| TC-090 | Positive | Resubmit after rejection | Caller `verification_status='rejected'` | `POST /me/identity` | Allowed; back to `pending`, `verification_rejection_reason` cleared |
| TC-091 | Negative | Resubmit while already pending | Caller `verification_status='pending'` | `POST /me/identity` | 409 |
| TC-092 | Negative | Resubmit while already verified | Caller `verification_status='verified'` | `POST /me/identity` | 409 |
| TC-093 | Negative | Missing `id_document_url` | — | `POST /me/identity {}` | 400 |
| TC-094 | Positive | Sysadmin lists pending verification queue | Caller sysadmin | `GET /admin/verifications` | Defaults to `status=pending`, oldest-first |
| TC-095 | Positive | List all verification statuses | — | `GET /admin/verifications?status=all` | Unfiltered list |
| TC-096 | Negative | Non-sysadmin cannot list verification queue | — | `GET /admin/verifications` | 403 |
| TC-097 | Positive | View a verification detail writes an audit entry | — | `GET /admin/verifications/:id` | Returns profile + `id_document_signed_url`; `system_audit_log` gets a new `account.id_viewed` row keyed by the admin's auth id |
| TC-098 | Negative | View unknown member id | — | `GET /admin/verifications/:bogusId` | 404 |
| TC-099 | Positive | Approve a pending verification | Target `pending` | `POST /admin/verifications/:id/approve` | `verified`, `verified_by/at` set, audit `account.verified`, member notified `identity.verified` |
| TC-100 | Negative | Approve a non-pending verification | Target not pending | Same call | 409 `Member is not pending verification` |
| TC-101 | Positive | Reject a pending verification with reason | Target `pending` | `POST /admin/verifications/:id/reject {reason}` | `rejected`; reason stored **member-visible**; audit `account.rejected`; notified `identity.rejected` |
| TC-102 | Negative | Reject a non-pending verification | Target not pending | Same call | 409 |

---

## 4. Cycles module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-011 | Positive | First cycle auto-activates | Group has no other `active` cycle | `POST /groups/:groupId/cycles {name, contribution_amount, start_date}` | Created with `status='active'` immediately — no separate activation step |
| TC-012 | Positive | Second cycle is forced into draft | Group already has an `active` cycle | `POST /groups/:groupId/cycles` | Created with `status='draft'` instead of erroring |
| TC-103 | Negative | Missing required fields | — | `POST /groups/:groupId/cycles {}` | 400 |
| TC-104 | Positive | List cycles newest-first | ≥2 cycles exist | `GET /groups/:groupId/cycles` | Ordered by `start_date` desc |
| TC-105 | Positive | Activate a draft cycle | Cycle `status='draft'`, no other active cycle | `POST /groups/:groupId/cycles/:id/activate` | `status='active'` |
| TC-106 | Negative | Activate a non-draft cycle | Cycle already active/closed | Same call | 404 |
| TC-107 | Positive | Close an active cycle | Cycle `status='active'` | `POST /groups/:groupId/cycles/:id/close` | RPC `close_cycle` succeeds; `status='closed'` |
| TC-108 | Regression (gap) | Close a non-active cycle surfaces as 500 | Cycle not active | Same call | RPC raises `'Cycle not found or not in active status'`, route does not map it to a 4xx — confirm actual response is a generic 500, not a friendly 409/404 |
| TC-109 | Positive | Cycle progress computation | Cycle has approved contributions | `GET /groups/:groupId/cycles/:id/progress` | `expected_total = contribution_amount × active membership count`; `collected_total` = sum of approved contribution credits; `percent_collected` matches |
| TC-110 | Regression (gap) | Progress on a bogus cycle id | — | `GET .../cycles/:bogusId/progress` | RPC raises `'Cycle not found'`; confirm the actual HTTP status returned (not guaranteed to be 404 since it bypasses the PGRST116 mapping) |

---

## 5. Contributions module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-111 | Positive | Member records own contribution | — | `POST /groups/:groupId/contributions {cycle_id, amount}` | `status='submitted'`, `recorded_by=self` |
| TC-018 | Positive | Officer records a contribution on behalf of another member | Target membership is active, same group | `POST .../contributions {cycle_id, amount, membership_id: otherMembership}` (caller is treasurer/auditor/owner) | Created for the target member; later rejection notification goes to the **owning member**, not necessarily the recorder |
| TC-112 | Negative | Plain member cannot record for someone else | Caller role = `member` | `POST .../contributions {membership_id: otherMembership}` | 403 `Only officers can record a contribution for another member` |
| TC-113 | Negative | `membership_id` not active / not same group | — | `POST .../contributions {membership_id: badId}` | 400 |
| TC-114 | Negative | Missing `cycle_id`/`amount` | — | `POST .../contributions {}` | 400 |
| TC-039 | Regression | Officer viewing the list lazily triggers late-penalty detection | An overdue cycle/membership combination exists with no submission | `GET /groups/:groupId/contributions` as treasurer/auditor/owner | `checkLatePenalties` runs as a side effect before the list is returned (errors from it are swallowed, request still 200) |
| TC-115 | Positive | Member sees only own contributions | — | `GET /groups/:groupId/contributions` as `member` | Filtered to caller's `membership_id` |
| TC-116 | Negative | Cannot approve your own recorded contribution | `recorded_by === approver` | `POST .../contributions/:id/approve` | 403, enforced both at the route and again inside the `approve_contribution` RPC |
| TC-117 | Positive | Approve a submitted contribution | Different recorder/approver | Same call | `status='approved'`; `contribution` credit ledger entry posted; `paid_date`/`approved_by` set |
| TC-118 | Negative | Approve a contribution that belongs to a different group | — | `POST /groups/:wrongGroupId/contributions/:id/approve` | 400 |
| TC-025 | Regression | Rejection reason is member-visible | — | `POST .../contributions/:id/reject {reason}` | `status='rejected'`, `rejection_reason` stored and returned to the member (not admin-only) |
| TC-120 | Regression (asymmetry) | Officer CAN reject their own recorded contribution | `recorded_by === rejecting officer` | `POST .../contributions/:id/reject` | Succeeds — unlike approve (TC-116), reject has no self-check; document as an intentional or accidental asymmetry |
| TC-121 | Negative | Reject a non-submitted contribution | Target not `submitted` | Same call | 404 |

---

## 6. Lending module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-035 | Negative | Unverified member cannot apply for a loan | Caller `verification_status != 'verified'` | `POST /groups/:groupId/loans {principal, term_months}` | 403 (server-side re-check of the client-side gate) |
| TC-122 | Positive | Verified member applies for a loan | — | Same call | `status='pending'` |
| TC-123 | Negative | Missing `principal`/`term_months` | — | `POST .../loans {}` | 400 |
| TC-124 | Positive | Member sees only own loans | — | `GET /groups/:groupId/loans` as `member` | Filtered list |
| TC-125 | Negative | Member views another member's loan detail | — | `GET /groups/:groupId/loans/:otherLoanId` | 403 `You can only view your own loans` |
| TC-013/TC-014/TC-034 | Positive | Eligibility check surfaces review reasons | Borrower has an existing active/approved loan, or a late contribution, or is unverified | `GET /groups/:groupId/loans/:id/eligibility` (officer) | `{eligible:false, reasons:[...]}` covering all applicable reasons; `available_cash` and `requested_principal` also returned; **liquidity is deliberately not one of the reasons here** |
| TC-126 | Negative | Eligibility check on wrong group | — | Same call, mismatched groupId | 400 |
| TC-040 | Positive | Partial approval when liquidity is short | `group_available_cash < principal` but `>= some lesser amount` | `POST .../loans/:id/approve {interest_rate, approved_principal: lesserAmount}` (owner) | Succeeds at the reduced amount instead of being blocked outright |
| TC-127 | Negative | `approved_principal` greater than requested `principal` | — | Same call with `approved_principal > principal` | RPC raises; request fails |
| TC-128 | Negative | Owner cannot approve their own loan | Loan belongs to the approving owner's membership | `POST .../loans/:id/approve` | 403 |
| TC-129 | Negative | Treasurer attempts to approve a loan | Caller role = `treasurer` | Same call | 403 (approve is owner-only, by design, segregated from disbursement) |
| TC-130 | Negative | Approve blocked by outstanding eligibility reasons | Borrower has a late contribution on file | `POST .../loans/:id/approve` | 409 |
| TC-019 | Positive | Treasurer or owner disburses an approved loan | Loan `status='approved'` | `POST .../loans/:id/disburse` | `status='active'`; `loan_disbursement` debit ledger entry posted; `outstanding_balance` set |
| TC-132 | Negative | Disbursement blocked when liquidity dropped since approval | `group_available_cash < approved_principal` at disbursement time | Same call | 409 (liquidity re-checked, not just at approval time) |
| TC-133 | Regression (gap) | Disburse a loan not in `approved` status | Loan `pending`/`active`/`paid` | Same call | RPC raises `'Loan is not approved'`; confirm this is not specially mapped and falls through to a generic 500 |
| TC-134 | Positive | Owner rejects a pending loan with reason | Loan `pending` | `POST .../loans/:id/reject {reason}` | `rejected`; notified `loan.rejected` |
| TC-135 | Negative | Reject a non-pending loan | — | Same call | 404 |
| TC-136 | Negative | Repayment defaults `approver_id` to the recorder | `approver_id` omitted from body | `POST .../loans/:id/repayments {amount}` | 403 `Approver cannot be the same person as the recorder` — fails by default since `approver_id` defaults to `req.member.id` |
| TC-137 | Positive | Record a valid repayment | Explicit distinct `approver_id` passed | `POST .../loans/:id/repayments {amount, approver_id: otherOfficer}` | Interest-first split applied; `loan_repayment` credit ledger entry posted; `outstanding_balance` reduced |
| TC-138 | Positive | Repayment that fully pays off the loan | `amount` covers remaining `outstanding_balance` | Same call | Loan `status` flips to `paid` |
| TC-139 | Negative | Auditor attempts to record a repayment | Caller role = `auditor` | Same call | 403 (auditor excluded from repayment recording) |
| TC-140 | Negative | Repayment missing `amount` | — | `POST .../loans/:id/repayments {}` | 400 |

---

## 7. Expenses module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-141 | Positive | Treasurer/owner records an expense | — | `POST /groups/:groupId/expenses {amount}` | `status='submitted'` |
| TC-142 | Negative | Auditor attempts to record an expense | Caller role = `auditor` | Same call | 403 |
| TC-143 | Negative | Missing `amount` | — | `POST .../expenses {}` | 400 |
| TC-144 | Positive | Owner/auditor approves an expense | Different recorder/approver; sufficient cash | `POST .../expenses/:id/approve` | `expense` debit ledger entry posted; `status='approved'` |
| TC-145 | Negative | Self-approval / treasurer excluded from approving | Approver = recorder, or caller role = `treasurer` | Same call | 403 |
| TC-146 | Negative | Insufficient available cash | `group_available_cash < expense.amount` | Same call | 409 `Insufficient fund balance to cover this expense` |
| TC-147 | Positive | Reject a submitted expense | Expense `submitted` | `POST .../expenses/:id/reject` | `rejected` — note there is no `reason` field on this endpoint at all (inconsistent with contributions/loans/penalties) |
| TC-148 | Negative | Reject a non-submitted expense | — | Same call | 404 |

---

## 8. Distribution module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-149 | Positive | Owner sets a membership's heads | — | `PATCH /groups/:groupId/memberships/:id/heads {heads: 2}` | Updated |
| TC-150 | Negative | `heads` missing or < 1 | — | `PATCH .../heads {heads: 0}` | 400 |
| TC-151 | Positive | Preview a distribution | `available_cash > 0`; active memberships have heads assigned | `POST /groups/:groupId/distributions/preview {period}` | `distributions` row `status='previewed'`; one allocation per active membership, share proportional to heads |
| TC-152 | Negative | Preview when there is nothing to distribute | `available_cash <= 0` | Same call | 409 `Nothing to distribute...` |
| TC-153 | Regression (gap) | Preview when no active member has heads assigned | `sum(heads)=0` | Same call | RPC raises `'No active members with heads assigned'`; confirm this is NOT mapped to 409 like the cash case is, and falls through differently |
| TC-038 | Positive | Unverified members still receive a distribution share | An active membership belongs to an unverified member | Preview a distribution | That membership still gets an allocation — verification gates privileges (borrowing, officer roles), not ownership of contributed capital |
| TC-027 | Positive | Auditor verifies a previewed distribution | Distribution `status='previewed'` | `POST .../distributions/:id/verify {notes}` | `status='verified'` |
| TC-154 | Negative | Verify a non-previewed distribution | — | Same call | 409 |
| TC-155 | Positive | Member sees only their own allocation | Caller role = `member` | `GET /groups/:groupId/distributions/:id` | Other members' allocation rows are filtered out |
| TC-015 | Positive | Owner finalizes a verified distribution | Distribution `status='verified'`; fund unchanged since preview | `POST .../distributions/:id/finalize` | One `distribution` debit ledger entry per allocation; `status='finalized'`; every allocated member notified `distribution.finalized` |
| TC-156 | Negative | Finalize a distribution that was never verified | Distribution still `previewed` | Same call | 409 `not verified` (0028 supersedes the older previewed-only rule) |
| TC-157 | Negative | Finalize when the fund changed since preview | A contribution/expense/loan posted between preview and finalize | Same call | 409 `Fund changed since preview...` |
| TC-158 | Positive | Auditor cancels a previewed distribution | Distribution `status='previewed'` | `DELETE /groups/:groupId/distributions/:id` | Distribution + allocations deleted |
| TC-159 | Regression (gap) | Cancel a verified/finalized distribution | Distribution not `previewed` | Same call | Returns 404 (0 rows matched) rather than a clearer "already verified/finalized, cannot cancel" message |

---

## 9. Ledger module (reversal workflow + adjustments)

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-021 | Positive | Initiate a reversal request | Entry exists, not itself a reversal, no active request against it | `POST /groups/:groupId/ledger/:entryId/reverse {reason}` | `ledger_reversal_requests` row created `status='pending_verification'`; no ledger mutation yet |
| TC-160 | Negative | Cannot reverse a reversal entry | Target entry `entry_type='reversal'` | Same call | 409 |
| TC-161 | Negative | Cannot double-request a reversal | An active (`pending_verification`/`verified`/`finalized`) request already exists for the entry | Same call | 409 `already has an active or completed reversal request` |
| TC-162 | Positive | Re-request after a prior rejection | Prior request `status='rejected'` | Same call | Allowed — a rejected request does not block a new one |
| TC-163 | Negative | Missing `reason` | — | `POST .../reverse {}` | 400 |
| TC-026 | Positive | Auditor verifies a pending reversal request | Request `status='pending_verification'` | `POST .../reversal-requests/:id/verify {notes}` | `status='verified'` |
| TC-164 | Negative | Verify a request not pending | — | Same call | 409 |
| TC-165 | Positive | Auditor rejects a pending reversal request | Request `pending_verification` | `POST .../reversal-requests/:id/reject {notes}` | `status='rejected'` |
| TC-166 | Positive | Owner finalizes a verified reversal request | Request `status='verified'` | `POST .../reversal-requests/:id/finalize` | Reversing ledger entry posted (opposite direction); request `status='finalized'`; member notified `ledger.reversed` if the original entry has a `membership_id` |
| TC-167 | Negative | Finalize a request not yet verified | — | Same call | 409 `Reversal request is not verified` |
| TC-168 | Regression | No notification fires for a group-level entry reversal | Original entry has no `membership_id` (e.g. an expense) | Finalize its reversal request | Reversal still posts, but no `ledger.reversed` notification is sent (no member to notify) |
| TC-169 | Regression (design gap) | Manual adjustment has no approval workflow | Caller is owner/treasurer | `POST /groups/:groupId/ledger/adjustment {membership_id, direction, amount, reason}` | Posts immediately, single-step — unlike every other money-affecting action in the system, which requires a second approver or full initiate→verify→finalize chain. Flag for product review. |
| TC-170 | Negative | Adjustment with invalid direction/non-positive amount | — | `POST .../adjustment {direction:'sideways', amount:-5}` | 400 |
| TC-171 | Negative | Adjustment missing reason | — | `POST .../adjustment {}` | 400 |

---

## 10. Penalties module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-172 | Positive | Manual penalty check flags a missed contribution | An active cycle with `contribution_due_day` set has passed due date for a membership with no submission this period | `POST /groups/:groupId/penalties/check` | Inserts a `late` contribution row and a linked `pending` penalty; member notified `penalty.charged` |
| TC-173 | Regression | Idempotent across repeated runs in the same period | Same conditions as TC-172, already run once | `POST .../penalties/check` again | No duplicate late-contribution/penalty rows created for the same membership+due_date |
| TC-017 | Positive | Owner waives a pending penalty with a reason | Penalty `status='pending'` | `POST /groups/:groupId/penalties/:id/waive {reason}` | `status='waived'`; `waived_by/at` set; member notified `penalty.waived` |
| TC-174 | Negative | Waive without a reason | — | `POST .../penalties/:id/waive {}` | 400 |
| TC-175 | Negative | Waive an already-waived penalty | Penalty not `pending` | Same call | 409 `Penalty is not pending` |
| TC-176 | Regression (documented gap) | No "pay penalty" endpoint exists | — | Attempt to find any route transitioning a penalty to `paid` | None exists — `penalty_status='paid'` and `ledger_entry_id` are schema-supported but unreachable via the API. Record as a known incomplete feature, not a bug to "fix" by writing a test that expects it to work. |

---

## 11. Reporting module (read-only)

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-177 | Positive | Group summary totals | Officer caller | `GET /groups/:groupId/reports/summary` | Correct `total_contributions`, `total_loan_disbursements/repayments`, `total_expenses`, `total_distributions`, `available_cash`, `active_members`, `pending_loans` |
| TC-178 | Regression | Fund-summary matches officer summary | Member caller | `GET /groups/:groupId/reports/fund-summary` | Same aggregate figures as TC-177 — the two endpoints share the same RPC today (kept separate for future divergence) |
| TC-179 | Positive | Member balances report | Officer caller | `GET /groups/:groupId/reports/member-balances` | One row per active membership with correct `balance` |
| TC-180 | Regression (security) | Member is force-scoped on ledger report | Caller role = `member`, passes `?membership_id=someoneElse` | `GET /groups/:groupId/reports/ledger?membership_id=other` | Query param is ignored/overridden; only caller's own entries returned |
| TC-181 | Positive | Officer can filter ledger report by membership | Officer caller | `GET .../reports/ledger?membership_id=X&entry_type=contribution&limit=10` | Filtered correctly, `limit` respected |
| TC-182 | Positive | My-balance summary | — | `GET /groups/:groupId/reports/my-balance` | Correct `contributions`, `loan_outstanding`, `balance` for caller |

---

## 12. Notifications module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-183 | Positive | List my notifications | — | `GET /me/notifications` | Default limit 50, newest first |
| TC-184 | Positive | Filter unread only | Mix of read/unread notifications | `GET /me/notifications?unread=true` | Only unread returned |
| TC-185 | Positive | Mark my notification read | Notification belongs to caller | `POST /me/notifications/:id/read` | Marked read |
| TC-186 | Negative | Cannot mark another member's notification read | Notification belongs to someone else | `POST /me/notifications/:otherId/read` | 404 (no confirmation the id even exists for another user) |
| TC-187 | Positive | Mark all read | Several unread notifications | `POST /me/notifications/read-all` | All flipped to read |
| TC-188 | Positive | Push token ownership follows the latest login | Token registered under member A | Register same token under member B via `POST /me/push-token {token}` | Token now belongs to B; A no longer receives pushes to it |
| TC-189 | Regression (security gap) | Push token deletion is not scoped to the caller | Caller knows another device's raw token string | `DELETE /me/push-token {token: otherDevicesToken}` | Deletes it — the route matches on token value alone, not `member_id`. Flag as a minor authorization gap. |

---

## 13. Monitoring module (sysadmin only)

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-190 | Positive | Admin identity echo | Caller sysadmin | `GET /admin/me` | `{user_id, email}` |
| TC-191 | Negative | Non-sysadmin blocked from all monitoring routes | — | Any `/admin/monitoring/*` route | 403 |
| TC-192 | Positive | Platform overview | — | `GET /admin/monitoring/overview` | Correct platform-wide aggregates |
| TC-193 | Positive | Groups overview | — | `GET /admin/monitoring/groups` | Per-active-group `{active_members, available_cash, active_loans}` |
| TC-194 | Positive | Audit log filter | — | `GET /admin/monitoring/audit?action=account.verified&limit=20` | Filtered `system_audit_log` rows |
| TC-195 | Positive | Recent platform activity | — | `GET /admin/monitoring/activity?limit=10` | Recent ledger entries with group name/fund_code joined |
| TC-196 | Positive | Search with a too-short query | `q` length < 2 | `GET /admin/search?q=a` | 200 with empty arrays (not 400) |
| TC-197 | Negative (security) | Search query containing filter-injection characters | `q` contains `,`, `)`, or `.` | `GET /admin/search?q=a,b)c.d` | Query term is safely escaped (`toIlikeTerm`); no PostgREST filter-string error/injection |

---

## 14. Chat module

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-198 | Positive | Member reads the general channel | — | `GET /groups/:groupId/messages?channel=general` | 200 |
| TC-199 | Negative | Member blocked from officers channel | Caller role = `member` | `GET .../messages?channel=officers` | 403 `Only officers can view the officers room` |
| TC-200 | Positive | Officer reads the officers channel | Caller role ∈ owner/treasurer/auditor | Same call | 200 |
| TC-201 | Negative | Invalid channel value | — | `GET .../messages?channel=random` | 400 |
| TC-202 | Positive | Pagination via cursor | >30 messages exist | `GET .../messages?before=<ISO timestamp>&limit=100` | Strictly-before cursor respected; `limit` capped at 100 |
| TC-203 | Negative | Empty message body | — | `POST .../messages {channel:'general', body:'   '}` | 400 `Message cannot be empty` |
| TC-204 | Negative | Message exceeds 2000 characters | — | `POST .../messages {body: <2001 chars>}` | 400 |
| TC-205 | Regression | Sender name is a point-in-time snapshot | Caller later changes their `full_name` | Post a message, then update profile name, then re-fetch the message | Old message still shows the original `sender_name` |

---

## 15. Admin Security module (sysadmin setup + public recovery)

| TC ID | Type | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-206 | Positive | View security questions before setup | Sysadmin has never configured questions | `GET /admin/security-questions` | `{question_1: null, question_2: null, updated_at: null}` — never returns hashes |
| TC-207 | Negative | Two identical questions | — | `PUT /admin/security-questions {question_1: q, question_2: q, ...}` | 400 `Choose two different questions.` |
| TC-208 | Negative | Missing one of the four fields | — | `PUT .../security-questions {question_1, answer_1}` | 400 |
| TC-209 | Positive | Set security questions | All 4 fields valid, distinct questions | `PUT .../security-questions {...}` | Hashed answers stored; `GET` afterward still never returns answer hashes |
| TC-210 | Negative | Recovery lookup for unknown/unconfigured admin email | — | `GET /admin/recover/questions?email=x` | 404 generic message (does not distinguish "no such admin" from "admin exists but no questions set") |
| TC-211 | Positive | Recovery lookup for a configured admin | Questions configured | `GET /admin/recover/questions?email=validAdmin` | Returns `question_1`/`question_2` |
| TC-212 | Negative | Rate limit after repeated attempts | 5 prior attempts for the same email in the last 15 min | 6th `GET /admin/recover/questions?email=x` | 429 `Too many attempts. Try again later.` |
| TC-213 | Negative | Reset with one wrong answer | — | `POST /admin/recover/reset {email, answer_1: wrong, answer_2: correct, new_password}` | 401 `One or more answers are incorrect.` (generic, doesn't reveal which one) |
| TC-214 | Negative | New password too short | — | `POST .../reset {..., new_password: '1234567'}` | 400 `Password must be at least 8 characters.` |
| TC-215 | Positive | Successful password reset | Both answers correct (case/whitespace differences allowed) | `POST .../reset {...}` | Password updated via `supabaseAdmin.auth.admin.updateUserById`; attempt counter cleared |

---

## 16. Cross-cutting / system-level regression cases

| TC ID | Type | Title | Steps | Expected Result |
|---|---|---|---|---|
| TC-216 | Regression | `routes/admin/*` and `platform_admins`-based auth are unreachable | Call `/admin/verifications` variant expected to use `requireSysAdmin`, or inspect boot logs | Confirms this alternate admin model (migration 0016) is dead code — never mounted in `app.js`/`server.js`, and `middleware/requireSysAdmin.js` requires a `lib/supabaseAdmin` file that doesn't exist. Document as intentionally retired scaffolding pending confirmation from the dev team. |
| TC-217 | Regression | No app-wide rate limiting or security headers | Send a burst of requests to any non-recovery endpoint | No throttling/`helmet` headers present — only the bespoke in-memory limiter on `adminSecurity/recovery.routes.js` exists anywhere in the app |
| TC-218 | Regression | CORS accepts any origin | Send a request with an arbitrary `Origin` header | Request succeeds (open `cors()` with no allow-list) — confirm this is the intended deployment posture |
| TC-219 | Regression | Segregation-of-duties enforcement depth is inconsistent across modules | Compare contributions/expenses approval (route + RPC + DB CHECK) vs. loan repayment (RPC + DB CHECK only, no route pre-check) vs. loan approval (route-only, no RPC/DB backstop) | Confirms the inconsistency exists as designed today; useful baseline before any refactor that assumes uniform defense-in-depth |

---

## Coverage summary

| Module | Test cases |
|---|---|
| Shared auth/role middleware | 10 |
| Groups | 26 |
| Membership | 9 |
| Identity | 17 |
| Cycles | 10 |
| Contributions | 13 |
| Lending | 20 |
| Expenses | 8 |
| Distribution | 11 |
| Ledger | 12 |
| Penalties | 5 |
| Reporting | 6 |
| Notifications | 7 |
| Monitoring | 8 |
| Chat | 8 |
| Admin Security | 10 |
| Cross-cutting | 4 |
| **Total** | **~184** |
