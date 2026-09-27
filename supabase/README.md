# Database

PostgreSQL on Supabase. The full data model is in [docs/ERD.md](../docs/ERD.md).

## Migrations

One file per area, each holding only the current definitions:

| File | Contents |
|---|---|
| `0001_foundation.sql` | Extensions, enum types (incl. verification statuses), shared trigger functions, default grants |
| `0002_identity.sql` | members, identity_submissions, platform_admins, system_audit_log, admin_security_questions, push_tokens, login_activity, feedback, profile_update_requests |
| `0003_groups.sql` | groups, memberships, membership_head_names, cycles, accounts |
| `0004_ledger.sql` | ledger_entries (append-only), contributions, penalties, ledger_reversal_requests |
| `0005_lending.sql` | loans, loan_payments |
| `0006_distributions.sql` | distributions, distribution_allocations |
| `0007_oversight.sql` | audit_log, audit_flags, audit_findings |
| `0008_communication.sql` | notifications, messages, direct_messages, announcements |
| `0009_fn_access.sql` | Caller/role helpers, the `auth.users` → `members` trigger |
| `0010_fn_groups.sql` | Create/join group, member approval, cycle progress and close |
| `0011_fn_contributions.sql` | Money in: confirm → verify, walk-ins, penalties |
| `0012_fn_lending.sql` | Loan approve → review → release → verify; repayments |
| `0013_fn_ledger.sql` | Balances, group summary, adjustments, reversals, distributions |
| `0014_fn_admin.sql` | Platform overview and health checks for the admin dashboard |
| `0015_security.sql` | RLS, policies, function grants |
| `0016_storage.sql` | Storage bucket policies |
| `0017_realtime.sql` | Tables published to Supabase Realtime |
| `0018_notification_data.sql` | `notifications.data` — context for opening the right screen on tap |

**Changing the schema:** add a new numbered file (`0019_…`) — don't edit
files that have already been applied to a shared database.

## Fresh database

```sh
supabase db reset      # local
```

The reset also runs `seed.sql` and `seed_admin.sql`, which creates the platform
admin (`admin@kapitpondo.local` / `Admin1234` — development only).

## History

0001–0017 replaced 76 incremental migrations (the old files are in git
history). The consolidated schema matches the old one except that `expenses`
was removed and the two-step money functions were locked to service_role.
Any database built from the old files should be reset (`supabase db reset`)
rather than patched.
