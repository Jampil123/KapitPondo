# KapitPondo

KapitPondo is a digital paluwagan / cooperative fund management system that records and verifies money that moves outside the app (cash, bank, e-wallet transfers). It never holds or moves funds itself — every financial event is a claim that must be backed by proof and explicitly approved, and every posting is append-only with a full audit trail.

## Overview

KapitPondo digitizes the traditional paluwagan model by giving each group a structured cycle, transparent ledger, and role-based approval workflow — replacing manual notebooks and group chats with an auditable, accountable system.

## Core Principle

> Inflow and participation are open. Outflow, authority, and trust-bearing actions require verification and dual-control approval.

## Roles

| Role | Scope | Responsibility |
|---|---|---|
| System Administrator (Sysadmin) | Platform-wide | Identity verification, system monitoring |
| Group Owner (Organizer) | One group | Governance, lending decisions, finalization |
| Group Treasurer | One group | Records money movement (contributions, repayments, disbursement, expenses) |
| Group Auditor | One group | Verifies/approves Treasurer postings, reviews proofs |
| Group Member | Self-service | Joins groups, contributes, requests/repays loans |

**Core control rule (segregation of duties):** the person who records a transaction can never be the one who approves it. Loan authorization (Owner) is separate from loan disbursement (Treasurer).

## System Modules

| Module | Covers |
|---|---|
| M1 — Identity & Access | Sign-up, OTP, ID verification, login, recovery |
| M2 — Group Lifecycle | Group creation, fund code, archiving |
| M3 — Membership | Join requests, approval, member management, exit |
| M4 — Fund Cycle | Cycle setup, penalty config, cycle close |
| M5 — Contributions | Monthly contribution, proof, approval, penalties |
| M6 — Lending | Loan request, eligibility, approval, disbursement, repayment |
| M7 — Accounting & Ledger | Accounts, postings, expenses, reversals |
| M8 — Reporting | Filtered summaries and exports |
| M9 — Year-End Distribution | Preview, formula, deductions, finalize |
| M10 — Administration & Monitoring | Dashboards, audit log |
| CC — Cross-cutting | Notifications, audit trail, validation/security |

## Key Lifecycle States

- **Account:** Unverified → Pending Verification → Verified / Rejected
- **Membership:** Pending → Active → Suspended / Withdrawn
- **Cycle:** Setup → Active → Finalizing → Closed
- **Contribution:** Due → Submitted → Approved (Posted) / Rejected (+ Late flag)
- **Loan:** Requested → Approved / Partially Approved / Rejected → Active → Settled
- **Distribution:** Preview → Finalized (immutable)

## Project Structure

The project is organized as a multi-app workspace with three runnable targets:

| App | Description |
|---|---|
| API | Backend server — auth, ledger, business logic, database access |
| Mobile | Member-facing app — contributions, loans, ledger, notifications |
| Admin | Web dashboard for Sysadmin / Owner / Treasurer / Auditor workflows |

## Getting Started

### Prerequisites

- Node.js (LTS recommended)
- npm (comes with Node.js)
- Any environment variables / database connection required by the API (see `.env.example` if present)

### Installation

Run from the project root:

```bash
npm install
```

If the API, mobile, and admin apps live in separate workspaces/packages, make sure dependencies are installed for each (a monorepo tool like npm workspaces, Turborepo, or Nx will usually handle this from a single root install).

### Running the Apps

Each app is started with its own script. Run these in separate terminal windows/tabs, since each command starts a long-running dev process.

1. **Start the API server**

   ```bash
   npm run dev:api
   ```

   Handles authentication, ledger postings, approvals, and business logic. Confirm the port/URL in your terminal output or `.env` file — the mobile and admin apps will need this to connect.

2. **Start the Mobile app**

   ```bash
   npm run dev:mobile
   ```

   Starts the mobile development server (Expo/React Native). Make sure the API is running first so the mobile app can reach it.

3. **Start the Admin dashboard**

   ```bash
   npm run dev:admin
   ```

   Web dashboard used by Sysadmin, Owner, Treasurer, and Auditor roles. Also requires the API to be running.

### Suggested Run Order

1. `npm run dev:api` — start this first and confirm it's healthy
2. `npm run dev:mobile` and/or `npm run dev:admin` — start whichever client(s) you need

### Quick Reference

| Command | Starts |
|---|---|
| `npm run dev:api` | Backend API server |
| `npm run dev:mobile` | Mobile app (member-facing) |
| `npm run dev:admin` | Admin dashboard (officer/sysadmin-facing) |

### Exposing the API Publicly (Webhooks)

Some integrations (e.g. PayMongo) need to reach the API over a public URL that `localhost` can't provide. For local testing, tunnel the API port with `cloudflared`:

```bash
cloudflared tunnel --url http://localhost:4000
```

This prints a public HTTPS URL (e.g. `https://<random>.trycloudflare.com`) that forwards to your local API. Free quick tunnels generate a new random URL each time they're started, so any webhook endpoint registered against it (PayMongo, etc.) must be updated whenever the tunnel restarts.

## Documentation

For the full system design — actor/role matrix, module breakdown, state machines, and open design decisions — see the project's system flow documentation (`KapitPondo_System_Flow_Restructured.md`).
