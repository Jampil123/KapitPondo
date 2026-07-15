KapitPondo

KapitPondo is a digital paluwagan / cooperative fund management system that records and verifies money that moves outside the app (cash, bank, e-wallet transfers). It never holds or moves funds itself — every financial event is a claim that must be backed by proof and explicitly approved, and every posting is append-only with a full audit trail.

Overview

KapitPondo digitizes the traditional paluwagan model by giving each group a structured cycle, transparent ledger, and role-based approval workflow — replacing manual notebooks and group chats with an auditable, accountable system.

Core Principle


Inflow and participation are open. Outflow, authority, and trust-bearing actions require verification and dual-control approval.



Roles

RoleScopeResponsibilitySystem Administrator (Sysadmin)Platform-wideIdentity verification, system monitoringGroup Owner (Organizer)One groupGovernance, lending decisions, finalizationGroup TreasurerOne groupRecords money movement (contributions, repayments, disbursement, expenses)Group AuditorOne groupVerifies/approves Treasurer postings, reviews proofsGroup MemberSelf-serviceJoins groups, contributes, requests/repays loans

Core control rule (segregation of duties): the person who records a transaction can never be the one who approves it. Loan authorization (Owner) is separate from loan disbursement (Treasurer).

System Modules

ModuleCoversM1 — Identity & AccessSign-up, OTP, ID verification, login, recoveryM2 — Group LifecycleGroup creation, fund code, archivingM3 — MembershipJoin requests, approval, member management, exitM4 — Fund CycleCycle setup, penalty config, cycle closeM5 — ContributionsMonthly contribution, proof, approval, penaltiesM6 — LendingLoan request, eligibility, approval, disbursement, repaymentM7 — Accounting & LedgerAccounts, postings, expenses, reversalsM8 — ReportingFiltered summaries and exportsM9 — Year-End DistributionPreview, formula, deductions, finalizeM10 — Administration & MonitoringDashboards, audit logCC — Cross-cuttingNotifications, audit trail, validation/security

Key Lifecycle States


Account: Unverified → Pending Verification → Verified / Rejected
Membership: Pending → Active → Suspended / Withdrawn
Cycle: Setup → Active → Finalizing → Closed
Contribution: Due → Submitted → Approved (Posted) / Rejected (+ Late flag)
Loan: Requested → Approved / Partially Approved / Rejected → Active → Settled
Distribution: Preview → Finalized (immutable)


Project Structure

The project is organized as a multi-app workspace with three runnable targets:

AppDescriptionAPIBackend server — auth, ledger, business logic, database accessMobileMember-facing app — contributions, loans, ledger, notificationsAdminWeb dashboard for Sysadmin / Owner / Treasurer / Auditor workflows


Getting Started

Prerequisites


Node.js (LTS recommended)
npm (comes with Node.js)
Any environment variables / database connection required by the API (see .env.example if present)


Installation

bashnpm install

Run this from the project root. If the API, mobile, and admin apps live in separate workspaces/packages, make sure dependencies are installed for each (a monorepo tool like npm workspaces, Turborepo, or Nx will usually handle this from a single root install).

Running the Apps

Each app is started with its own script. Run these in separate terminal windows/tabs, since each command starts a long-running dev process.

1. Start the API server

bashnpm run dev:api

Starts the backend server (handles authentication, ledger postings, approvals, and business logic). Confirm the port/URL in your terminal output or .env file — the mobile and admin apps will need this to connect.

2. Start the Mobile app

bashnpm run dev:mobile

Starts the mobile development server (e.g., Expo/React Native or similar). Make sure the API is running first so the mobile app can reach it.

3. Start the Admin dashboard

bashnpm run dev:admin

Starts the admin web dashboard used by Sysadmin, Owner, Treasurer, and Auditor roles. Also requires the API to be running.

Suggested Run Order


npm run dev:api — start this first and confirm it's healthy
npm run dev:mobile and/or npm run dev:admin — start whichever client(s) you need


Quick Reference

CommandStartsnpm run dev:apiBackend API servernpm run dev:mobileMobile app (member-facing)npm run dev:adminAdmin dashboard (officer/sysadmin-facing)


Documentation

For the full system design — actor/role matrix, module breakdown, state machines, and open design decisions — see the project's system flow documentation (KapitPondo_System_Flow_Restructured.md).