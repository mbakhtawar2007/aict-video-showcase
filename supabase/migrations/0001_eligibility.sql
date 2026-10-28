-- AICT Phase 0 — eligibility skeleton ONLY (Spec v1.1 §4.1, §5.1, D7).
--
-- SCOPE: allowed_email_domains, email_allowlist, and settings.
-- The full schema (profiles, groups, projects, votes, comments, etc.)
-- is Phase 1+ work and is NOT in this migration.
--
-- DO NOT RUN YET:
--  * The new AICT Supabase project has NOT been created.
--  * NEVER run this against GreenKarachi or any other existing project.
--  * Replace the placeholder teacher rows below with real, lowercase
--    teacher addresses before running. Delete placeholder rows.
--  * Teachers and students are NOT distinguished by domain: any
--    lowercase @duet.edu.pk address passes via the domain row.
--    Role comes from email_allowlist (admin) or defaults to
--    student. (Domain change 2026-10-28: this supersedes the
--    earlier students.duet.edu.pk domain.)
--
-- Locked rules encoded here:
--  * University domain: duet.edu.pk, exact match only,
--    allow_subdomains = false, no +tag aliases (enforced by the
--    Phase 1 auth hook, not by this table alone).
--  * Teachers/admins: email_allowlist only, role = 'admin',
--    never self-service. Teachers share the duet.edu.pk domain
--    with students; there is no separate teacher domain.
--  * Roster mode OFF: a student does NOT also need an allowlist row.

create table if not exists public.allowed_email_domains (
  domain text primary key,
  allow_subdomains boolean not null default false,
  active boolean not null default true
);

create table if not exists public.email_allowlist (
  email text primary key,
  role text not null default 'student'
    check (role in ('student', 'admin')),
  note text
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);

-- RLS is intentionally minimal in Phase 0: the eligibility tables must
-- never be readable by clients. Full RLS policies (admin-only reads,
-- auth-hook role, is_active()/is_admin() helpers) are Phase 1 work.
-- Do not rely on this migration alone for production access control.
alter table public.allowed_email_domains enable row level security;
alter table public.email_allowlist enable row level security;
alter table public.settings enable row level security;

-- Seed: university domain for both teachers and students
-- (exact match only; students.duet.edu.pk is a subdomain and
-- therefore does NOT pass when allow_subdomains = false).
insert into public.allowed_email_domains (domain, allow_subdomains, active)
values ('duet.edu.pk', false, true)
on conflict (domain) do update
  set allow_subdomains = excluded.allow_subdomains,
      active = excluded.active;

-- Seed: PLACEHOLDER teacher/admin rows only.
-- Replace with real addresses before any live run.
insert into public.email_allowlist (email, role, note) values
  ('teacher1@duet.edu.pk', 'admin', 'AICT teacher - REPLACE WITH REAL ADDRESS'),
  ('teacher2@duet.edu.pk', 'admin', 'AICT teacher - REPLACE WITH REAL ADDRESS')
on conflict (email) do update
  set role = excluded.role,
      note = excluded.note;

-- Seed: defaults that follow from the locked rules.
insert into public.settings (key, value) values
  ('roster_mode', 'false'::jsonb),
  ('public_browsing', 'false'::jsonb),
  ('max_votes_per_user', '3'::jsonb),
  ('voting_open', 'false'::jsonb)
on conflict (key) do nothing;
