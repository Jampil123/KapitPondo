# KapitPondo — Project Reference (Folder Structure + Tech Stack + Server Code)

> This file is intended as AI assistant context. It covers the full monorepo layout, every tech stack choice, and a complete reference to the server-side API code.

---

## What Is KapitPondo?

KapitPondo is a **cooperative savings and contribution management system**. It lets members pool money into a group fund, track contributions per cycle, apply for loans from the fund, record expenses, and distribute year-end dividends. Officers (owner, treasurer, auditor) manage approvals; a system admin handles identity verification at the platform level.

---

## Monorepo Overview

```
kapitpondo/                   ← npm workspaces root
├── apps/
│   ├── admin/                ← React + Vite admin dashboard
│   └── mobile/               ← React Native + Expo mobile app
├── services/
│   └── api/                  ← Node.js + Express REST API
├── packages/
│   └── shared/               ← Shared TypeScript types, enums, Supabase client
├── supabase/
│   ├── migrations/           ← PostgreSQL migrations (9 files)
│   └── seed.sql
├── package.json              ← Root workspace config (npm workspaces)
└── tsconfig.json
```

---

## Tech Stack

### Backend — `services/api/`

| Layer | Technology |
|---|---|
| Runtime | Node.js (CommonJS) |
| Framework | Express 5 |
| Database client | `@supabase/supabase-js` v2 (service-role key, bypasses RLS) |
| Auth | Supabase Auth — Bearer JWT validated via `supabaseAdmin.auth.getUser(token)` |
| Environment config | `dotenv` |
| Dev server | `nodemon` |
| Language | JavaScript (`.js`), with a few TypeScript stubs (`.ts`) for `lib/` |
| Port | `4000` (default, overridable via `PORT` env var) |

### Mobile App — `apps/mobile/`

| Layer | Technology |
|---|---|
| Framework | React Native 0.85 + Expo SDK 56 |
| Router | Expo Router (file-based, `app/` directory) |
| Styling | NativeWind 4 (Tailwind CSS for React Native) + `tailwind.config.js` |
| Font | Poppins (via `@expo-google-fonts/poppins`) |
| HTTP client | Custom `api.ts` wrapper over `fetch` with auto Bearer token |
| Auth/Session | Supabase JS client (anon key) + AsyncStorage for session persistence |
| Navigation | Expo Router Stack — screens: `index`, `(auth)`, `(member)`, `(officer)` |
| Icons | `@expo/vector-icons` + `expo-symbols` |
| Images | `expo-image` |
| Animation | `react-native-reanimated` v4 |
| Gestures | `react-native-gesture-handler` |
| Language | TypeScript 6 |
| Build tooling | Metro bundler, EAS (Expo Application Services) |
| Android package | `com.johnp15.kapitPondo` |

### Admin Dashboard — `apps/admin/`

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin) |
| Database client | `@supabase/supabase-js` v2 |
| Language | TypeScript 6 |
| Linting | ESLint 10 + `eslint-plugin-react-hooks` + `typescript-eslint` |
| Pages | `monitoring/`, `reports/`, `verification/` |

### Shared Package — `packages/shared/`

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Validation | `zod` v3 |
| Exports | Types, enums, Supabase client factory |

### Database — `supabase/`

| Layer | Technology |
|---|---|
| Platform | Supabase (hosted PostgreSQL) |
| Auth | Supabase Auth (built-in, 1:1 with `members` table via `auth_id`) |
| Row Level Security | Enabled (policies in migration `0007_rls_policies.sql`) |
| Money storage | `numeric(14,2)` — exact decimal, never float |
| Ledger model | Append-only `ledger_entries` table (UPDATE/DELETE blocked by triggers) |
| UUID generation | `pgcrypto` extension (`gen_random_uuid()`) |
| Migrations | 9 sequential SQL files |

---

## Folder Structure (Detailed)

### `apps/mobile/`

```
apps/mobile/
├── app/                        ← Expo Router pages
│   ├── _layout.tsx             ← Root layout (Stack navigator, fonts, splash)
│   └── index.tsx               ← Entry/landing screen
├── src/
│   ├── lib/
│   │   ├── api.ts              ← fetch wrapper (auto Bearer token, LAN-IP resolution)
│   │   ├── member.ts
│   │   └── supabase.ts         ← Supabase anon client (AsyncStorage session)
│   ├── components/
│   │   └── ui/
│   ├── features/
│   ├── hooks/
│   └── theme/
├── android/
│   └── app/src/main/
│       ├── java/com/johnp15/kapitPondo/
│       │   ├── MainActivity.kt
│       │   └── MainApplication.kt
│       └── res/
├── assets/
│   ├── images/
│   │   └── tabIcons/
│   └── expo.icon/
├── app.json
├── babel.config.js
├── eas.json
├── expo-env.d.ts
├── global.css
├── metro.config.js
├── nativewind-env.d.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

### `apps/admin/`

```
apps/admin/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── assets/
│   ├── components/
│   ├── lib/
│   └── pages/
│       ├── monitoring/
│       ├── reports/
│       └── verification/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js
└── package.json
```

### `packages/shared/`

```
packages/shared/
├── src/
│   ├── index.ts
│   ├── constants/
│   ├── enums.ts      ← MembershipRole, VerificationStatus, LoanStatus, etc.
│   ├── supabase.ts
│   └── types.ts      ← TypeScript interfaces matching DB tables
└── package.json
```

### `supabase/`

```
supabase/
├── migrations/
│   ├── 0001_initial_schema.sql          ← All tables, triggers, indexes
│   ├── 0002_grants_functions_trigger.sql
│   ├── 0003_drop_duplicate_functions.sql
│   ├── 0004_fix_enum_casts.sql
│   ├── 0005_create_group_uses_auth_uid.sql
│   ├── 0006_get_or_create_member_rpc.sql
│   ├── 0007_rls_policies.sql
│   ├── 0008_join_group_by_code_rpc.sql
│   └── 0009_approval_rpcs.sql
└── seed.sql
```

---

## Server API — Full Reference (`services/api/`)

### Entry Points

**`src/server.js`** — boots the HTTP server
```js
const app = require('./app');
const env = require('./config/env');
app.listen(env.port, () => console.log(`KapitPondo API running on http://localhost:${env.port}`));
```

**`src/app.js`** — registers all middleware and routes
```
Middleware: cors(), express.json()
Routes:
  GET  /                          → "KapitPondo API is running"
  *    /health                    → health.js
  *    /me                        → me.js
  *    /api                       → all modules below
```

### Config

**`src/config/env.js`**
- Reads `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from `.env`
- Default port: `4000`
- Warns (does not crash) if Supabase credentials are missing

**`src/config/supabase.js`**
- Creates a service-role Supabase client (`autoRefreshToken: false`, `persistSession: false`)
- This client bypasses Row Level Security — backend only, never expose to apps

### Middleware

**`src/middleware/auth.js` — `requireAuth`**
- Extracts Bearer token from `Authorization` header
- Validates token via `supabaseAdmin.auth.getUser(token)`
- Looks up `members` table by `auth_id` → attaches `req.authUser` and `req.member`
- Returns `401` if token missing/invalid, `403` if no member profile found

**`src/middleware/requireGroupRole.js` — `requireGroupRole(allowedRoles[])`**
- Reads `groupId` from `req.params`, `req.body`, or `req.query`
- Queries `memberships` for an active membership matching `req.member.id` + `groupId`
- Checks role is in `allowedRoles`
- Attaches `req.membership`; returns `403` if not a member or wrong role

**`src/middleware/requireSystemAdmin.js` — `requireSystemAdmin`**
- Checks `req.member.is_system_admin === true`
- Returns `403` otherwise

**`src/middleware/errorHandler.js`**
- Catches PostgREST `PGRST116` (`.single()` found 0 rows) → `404`
- All other errors → `err.status || 500`

### Routes

#### `GET /health`
Returns `{ status: "ok", service: "KapitPondo API", time: <ISO> }`

#### `GET /me`
Returns `{ member: req.member }` for the authenticated user.

---

### Module: `groups` — `/api`

**`POST /api/groups`** — `requireAuth`
Create a group. Body: `{ name, fund_code, description? }`. Caller becomes owner. Returns `{ group }`.

**`POST /api/groups/join-by-code`** — `requireAuth`
Join a group by its fund code. Body: `{ fund_code }`. Creates a pending membership. Returns `{ membership, group }`.

**`GET /api/groups`** — `requireAuth`
List all groups the caller belongs to (active or pending). Returns `{ groups }` with role + group data.

**`GET /api/groups/:groupId`** — `requireAuth` + `requireGroupRole(['member','treasurer','auditor','owner'])`
Get a single group's details.

**`GET /api/groups/:groupId/members/pending`** — `requireGroupRole(['owner','treasurer','auditor'])`
List pending membership requests for a group.

**`PATCH /api/groups/:groupId/members/:memberId/approve`** — `requireGroupRole(['owner','treasurer'])`
Approve a pending membership.

**`PATCH /api/groups/:groupId/members/:memberId/reject`** — `requireGroupRole(['owner','treasurer'])`
Reject (delete) a pending membership.

**`GET /api/groups/:groupId/members`** — `requireGroupRole(['owner','treasurer','auditor'])`
List all active members of a group.

**`PATCH /api/groups/:groupId/members/:memberId/role`** — `requireGroupRole(['owner'])`
Promote or demote a member. Body: `{ role }` — one of `member`, `treasurer`, `auditor`.

**`DELETE /api/groups/:groupId/members/:memberId`** — `requireGroupRole(['owner'])`
Remove an active member (sets status to `exited`).

**Groups Service key logic:**
- `createGroup`: inserts group + owner membership atomically
- `joinByCode`: resolves group by `fund_code` (case-insensitive), guards duplicate, inserts pending membership
- `listMyGroups`: joins `memberships` + `groups`, returns both active and pending
- All queries use the service-role Supabase client directly (no RPC)

---

### Module: `membership` — `/api`

**`POST /api/groups/:groupId/join`** — `requireAuth`
Request to join. Requires `req.member.verification_status === 'verified'`. Creates pending membership.

**`GET /api/groups/:groupId/memberships`** — `requireGroupRole(['treasurer','auditor','owner'])`
List memberships in a group. Optional `?status=` filter.

**`POST /api/groups/:groupId/memberships/:id/approve`** — `requireGroupRole(['owner','treasurer'])`
Approve a pending member. Sets `status: active`, records `approved_by`.

**`PATCH /api/groups/:groupId/memberships/:id/role`** — `requireGroupRole(['owner'])`
Assign a role. Allowed values: `member`, `treasurer`, `auditor`, `owner`.

---

### Module: `cycles` — `/api`

**`POST /api/groups/:groupId/cycles`** — `requireGroupRole(['owner','treasurer'])`
Create a contribution cycle. Body: `{ name, contribution_amount, start_date, frequency?, penalty_amount?, penalty_type?, end_date? }`. Default frequency: `monthly`, penalty type: `fixed`. Created in `draft` status.

**`GET /api/groups/:groupId/cycles`** — `requireGroupRole(['member','treasurer','auditor','owner'])`
List all cycles for the group (descending by start date).

**`POST /api/groups/:groupId/cycles/:id/activate`** — `requireGroupRole(['owner','treasurer'])`
Activate a draft cycle. The DB has a partial unique index (`one_active_cycle_per_group`) that rejects a second active cycle with `23505`.

**`POST /api/groups/:groupId/cycles/:id/close`** — `requireGroupRole(['owner','treasurer'])`
Close an active cycle. Calls SQL RPC `close_cycle(p_cycle_id)`.

---

### Module: `contributions` — `/api`

**`POST /api/groups/:groupId/contributions`** — `requireGroupRole(['member','treasurer','auditor','owner'])`
Submit a contribution. Body: `{ cycle_id, amount, payment_method?, proof_url?, external_reference? }`. Created with `status: submitted`.

**`GET /api/groups/:groupId/contributions`** — `requireGroupRole(all roles)`
List contributions. Members see only their own (`membership_id` filter). Officers see all. Optional `?status=` and `?cycle_id=` filters.

**`POST /api/groups/:groupId/contributions/:id/approve`** — `requireGroupRole(['treasurer','auditor','owner'])`
Approve a contribution. Guard: approver cannot be the recorder (segregation of duties). Calls SQL RPC `approve_contribution(p_contribution_id, p_approver_id)` which posts a ledger entry.

**`POST /api/groups/:groupId/contributions/:id/reject`** — `requireGroupRole(['treasurer','auditor','owner'])`
Reject a contribution. Sets `status: rejected`.

---

### Module: `lending` — `/api`

**`POST /api/groups/:groupId/loans`** — `requireGroupRole(all roles)`
Apply for a loan. Body: `{ principal, term_months, purpose? }`. Interest rate is NOT set here — officer sets it at approval. Created with `status: pending`.

**`GET /api/groups/:groupId/loans`** — `requireGroupRole(all roles)`
List loans. Members see only their own. Officers see all. Optional `?status=` filter.

**`GET /api/groups/:groupId/loans/:id`** — `requireGroupRole(all roles)`
Get a single loan + its payments. Members can only see their own.

**`GET /api/groups/:groupId/liquidity`** — `requireGroupRole(['treasurer','auditor','owner'])`
Check available fund cash. Calls SQL RPC `group_available_cash(p_group_id)`.

**`POST /api/groups/:groupId/loans/:id/approve`** — `requireGroupRole(['treasurer','owner'])`
Approve and disburse a loan. Body: `{ interest_rate }` (monthly rate, e.g. `0.03` = 3%). Guard: officer cannot approve their own loan. Calls SQL RPC `approve_and_disburse_loan(p_loan_id, p_approver_id, p_interest_rate)`. Returns ledger entry.

**`POST /api/groups/:groupId/loans/:id/reject`** — `requireGroupRole(['treasurer','owner'])`
Reject a pending loan. Sets `status: rejected`.

**`POST /api/groups/:groupId/loans/:id/repayments`** — `requireGroupRole(['treasurer','owner'])`
Record a loan repayment. Body: `{ amount, payment_method?, proof_url?, external_reference?, approver_id? }`. Calls SQL RPC `record_loan_repayment(...)`. Segregation of duties enforced in SQL.

---

### Module: `expenses` — `/api`

**`POST /api/groups/:groupId/expenses`** — `requireGroupRole(['treasurer','owner'])`
Record an expense. Body: `{ amount, category?, description?, proof_url? }`. Created with `status: submitted`.

**`GET /api/groups/:groupId/expenses`** — `requireGroupRole(['treasurer','auditor','owner'])`
List expenses. Optional `?status=` filter.

**`POST /api/groups/:groupId/expenses/:id/approve`** — `requireGroupRole(['owner','auditor'])`
Approve an expense. Guard: approver cannot be the recorder. Calls service which calls SQL RPC `approve_expense(...)`. Returns ledger entry.

**`POST /api/groups/:groupId/expenses/:id/reject`** — `requireGroupRole(['owner','auditor'])`
Reject an expense.

---

### Module: `distribution` — `/api`

**`PATCH /api/groups/:groupId/memberships/:id/heads`** — `requireGroupRole(['owner'])`
Set a member's head count (affects their share of distributions). Body: `{ heads }` — must be ≥ 1.

**`POST /api/groups/:groupId/distributions/preview`** — `requireGroupRole(['owner','treasurer'])`
Preview a year-end distribution. Body: `{ period }` (e.g. `"2026"`). Creates a `previewed` distribution + allocations. Returns `{ distribution, allocations }`.

**`GET /api/groups/:groupId/distributions`** — `requireGroupRole(all roles)`
List all distributions for the group.

**`GET /api/groups/:groupId/distributions/:id`** — `requireGroupRole(all roles)`
Get one distribution + its allocations.

**`POST /api/groups/:groupId/distributions/:id/finalize`** — `requireGroupRole(['owner'])`
Finalize a previewed distribution. Posts payout ledger entries, fund balance goes to 0. Returns `409` if fund changed since preview.

**`DELETE /api/groups/:groupId/distributions/:id`** — `requireGroupRole(['owner','treasurer'])`
Cancel a previewed distribution (so it can be re-run).

---

### Module: `reporting` — `/api`

**`GET /api/groups/:groupId/reports/summary`** — `requireGroupRole(['treasurer','auditor','owner'])`
Group financial summary.

**`GET /api/groups/:groupId/reports/member-balances`** — `requireGroupRole(['treasurer','auditor','owner'])`
Per-member balances across the group.

**`GET /api/groups/:groupId/reports/ledger`** — `requireGroupRole(all roles)`
Ledger feed. Members see only their own entries. Officers can filter by `?membership_id=`, `?entry_type=`, `?limit=`.

**`GET /api/groups/:groupId/reports/my-balance`** — `requireGroupRole(all roles)`
The caller's own balance in this group.

---

### Module: `ledger` — `/api`

**`POST /api/groups/:groupId/ledger/:entryId/reverse`** — `requireGroupRole(['owner'])`
Reverse a ledger entry. Body: `{ reason }` (required). Creates an opposing entry. Returns `409` if already reversed.

**`POST /api/groups/:groupId/ledger/adjustment`** — `requireGroupRole(['owner','treasurer'])`
Post a manual adjustment. Body: `{ membership_id?, direction: 'credit'|'debit', amount, reason }`.

---

### Module: `identity` — `/api`

**`GET /api/me/profile`** — `requireAuth`
Get the current member's own profile + verification status.

**`POST /api/me/identity`** — `requireAuth`
Submit or resubmit an identity document. Body: `{ id_document_url, full_name?, phone? }`. Only works when status is `unverified` or `rejected`. Sets status to `pending`.

**`GET /api/admin/verifications`** — `requireAuth` + `requireSystemAdmin`
List members in the verification queue. Default `?status=pending`; can filter by `verified`, `rejected`.

**`GET /api/admin/verifications/:id`** — `requireSystemAdmin`
Get one member's full record.

**`POST /api/admin/verifications/:id/approve`** — `requireSystemAdmin`
Approve a member's identity. Sets `verification_status: verified`, records `verified_by` + `verified_at`.

**`POST /api/admin/verifications/:id/reject`** — `requireSystemAdmin`
Reject a member's identity (they may resubmit). Sets `verification_status: rejected`.

---

### Module: `monitoring` — `/api` (System Admin only)

**`GET /api/admin/monitoring/overview`** — `requireSystemAdmin`
Platform headline numbers.

**`GET /api/admin/monitoring/groups`** — `requireSystemAdmin`
Per-group health table.

**`GET /api/admin/monitoring/audit`** — `requireSystemAdmin`
System-wide audit feed. Optional `?group_id=`, `?action=`, `?limit=` (default 100).

**`GET /api/admin/monitoring/activity`** — `requireSystemAdmin`
Recent platform-wide ledger activity. Optional `?limit=` (default 50).

---

## Database Schema

### Enum Types

| Enum | Values |
|---|---|
| `member_verification_status` | `unverified`, `pending`, `verified`, `rejected` |
| `group_status` | `active`, `archived` |
| `membership_role` | `owner`, `treasurer`, `auditor`, `member` |
| `membership_status` | `pending`, `active`, `suspended`, `exited` |
| `cycle_status` | `draft`, `active`, `closed` |
| `contribution_status` | `pending`, `submitted`, `approved`, `rejected` |
| `loan_status` | `pending`, `approved`, `active`, `paid`, `rejected`, `defaulted` |
| `loan_payment_status` | `scheduled`, `submitted`, `approved`, `paid`, `late`, `partial` |
| `distribution_status` | `draft`, `previewed`, `finalized` |
| `expense_status` | `submitted`, `approved`, `rejected` |
| `ledger_direction` | `credit`, `debit` |
| `ledger_entry_type` | `contribution`, `loan_disbursement`, `loan_repayment`, `distribution`, `expense`, `penalty`, `fee`, `adjustment`, `reversal` |
| `payment_method` | `paymongo`, `gcash`, `cash`, `bank_transfer`, `other` |
| `account_type` | `savings`, `share_capital` |

### Core Tables

| Table | Purpose |
|---|---|
| `members` | Platform-level user (1:1 with Supabase `auth.users`) |
| `groups` | A cooperative fund |
| `memberships` | Member belongs to group with role + status |
| `cycles` | A group's contribution period |
| `accounts` | Cached per-membership balance (derived from ledger) |
| `ledger_entries` | **Append-only** financial ledger — source of truth for balances |
| `contributions` | Contribution claim workflow |
| `loans` | Loan application + disbursement |
| `loan_payments` | Loan repayment schedule and actuals |
| `distributions` | Year-end dividend declaration |
| `distribution_allocations` | Per-member share of a distribution |
| `expenses` | Group operational expense claims |
| `audit_log` | Immutable action log (actor, entity, before/after JSON) |
| `notifications` | In-app notifications per member |

### Key Design Rules

- Money: always `numeric(14,2)` — no floats
- Ledger: append-only enforced by `BEFORE UPDATE` and `BEFORE DELETE` triggers that raise exceptions
- Segregation of duties: `CHECK` constraints on `contributions`, `loan_payments`, `expenses` ensure `recorded_by <> approved_by`
- One active cycle per group: partial unique index on `cycles(group_id) WHERE status = 'active'`
- Approval flows: critical operations (`approve_contribution`, `approve_and_disburse_loan`, `record_loan_repayment`, `close_cycle`) are implemented as PostgreSQL RPCs called via `supabase.rpc()`

### SQL RPCs Used by the API

| RPC | Called by |
|---|---|
| `approve_contribution(p_contribution_id, p_approver_id)` | contributions approve route |
| `close_cycle(p_cycle_id)` | cycles close route |
| `group_available_cash(p_group_id)` | lending liquidity route |
| `approve_and_disburse_loan(p_loan_id, p_approver_id, p_interest_rate)` | lending approve route |
| `record_loan_repayment(p_loan_id, p_amount, p_recorded_by, p_approver_id, ...)` | lending repayments route |

---

## Shared TypeScript Types (`packages/shared/src/types.ts`)

```ts
Member         { id, auth_id, full_name, email, phone, is_system_admin, verification_status, id_document_url, created_at }
Group          { id, name, fund_code, description, owner_id, status, created_at }
Membership     { id, member_id, group_id, role, status, heads, joined_at, created_at }
Cycle          { id, group_id, name, contribution_amount, frequency, penalty_amount, penalty_type, start_date, end_date, status }
Contribution   { id, membership_id, cycle_id, group_id, amount, due_date, paid_date, is_late, status, payment_method, proof_url, external_reference, created_at }
Loan           { id, membership_id, group_id, principal, interest_rate, term_months, purpose, status, outstanding_balance, applied_at, created_at }
LoanPayment    { id, loan_id, amount, principal_portion, interest_portion, due_date, paid_date, status, created_at }
LedgerEntry    { id, group_id, membership_id, cycle_id, entry_type, direction, amount, source_type, source_id, description, posted_at }
Distribution   { id, group_id, cycle_id, period, total_amount, rate, status, finalized_at, created_at }
DistributionAllocation { id, distribution_id, membership_id, amount, ledger_entry_id }
```

---

## Environment Variables

### `services/api/.env`
```
PORT=4000
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### `apps/mobile/.env`
```
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
EXPO_PUBLIC_API_URL=<production-api-url>   # used in prod builds only
```

---

## Role Summary

| Role | Scope | Capabilities |
|---|---|---|
| `member` | Per group | View own contributions, loans, balance; apply for loans; submit contributions |
| `treasurer` | Per group | All member abilities + record expenses, approve contributions/loans, manage cycles |
| `auditor` | Per group | Read-only officer view of all group data; can approve/reject contributions and expenses |
| `owner` | Per group | All officer abilities + manage roles, finalize distributions, reverse ledger entries |
| `system_admin` | Platform | Identity verification queue; platform monitoring and audit feed |
