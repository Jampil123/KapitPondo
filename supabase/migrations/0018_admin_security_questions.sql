-- 0018_admin_security_questions.sql
-- Security-question password recovery for system admins. Needed because the
-- static admin account (admin@kapitpondo.local) has no real inbox, so
-- Supabase's email-link password reset can't reach it.
--
-- Answers are stored hashed (services/api/src/lib/passwordHash.js), never in
-- plaintext. No RLS policies are defined, so only the service-role client
-- (the backend) can read or write this table — clients get nothing.

create table if not exists public.admin_security_questions (
  member_id     uuid primary key references public.members(id) on delete cascade,
  question_1    text not null,
  answer_1_hash text not null,
  question_2    text not null,
  answer_2_hash text not null,
  updated_at    timestamptz not null default now()
);

alter table public.admin_security_questions enable row level security;
