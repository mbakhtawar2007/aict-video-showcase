-- AICT Phase 1 — profiles, helpers, RLS, auth hook (Spec v1.1 §4.2-4.3, §5.1, A.1).
--
-- DO NOT RUN YET:
--  * The new AICT Supabase project has NOT been created.
--  * NEVER run this against GreenKarachi or any other existing project.
--  * This migration is LOCAL ONLY until a human creates the AICT project
--    and runs 0001 then 0002 against it. RLS and the hook have NOT
--    been tested against live Postgres (see PHASE1-REPORT.md).
--
-- TEACHERS SKIPPED FOR NOW (user decision 2026-10-28):
--  * This migration DELETES the two placeholder teacher rows that
--    0001 seeded (teacher1@ / teacher2@duet.edu.pk). Those addresses
--    are not real and must never reach a live allowlist.
--  * No teacher/admin row is seeded here. The allowlist table stays
--    (empty) so a human can seed real teacher emails later, and the
--    profile trigger still copies a role from the allowlist if a row
--    exists — but with teachers skipped, every Phase 1 sign-up that
--    reaches the trigger gets role 'student' unless an allowlist
--    row says otherwise.
--  * Domain change 2026-10-28: teachers and students share
--    @duet.edu.pk. Any lowercase @duet.edu.pk address passes via
--    the domain row; @students.duet.edu.pk is now a rejected
--    subdomain (allow_subdomains = false).

-- 1. Remove placeholder teacher rows from 0001. Idempotent.
delete from public.email_allowlist
where email in ('teacher1@duet.edu.pk', 'teacher2@duet.edu.pk');

-- 2. Profiles (1:1 with auth.users), per spec §4.1.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  full_name text,
  avatar_url text,
  bio text,
  class_section text,
  role text not null default 'student'
    check (role in ('student', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  onboarded_at timestamptz,
  last_verified_at timestamptz,
  reduce_effects boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username ~ '^[A-Za-z0-9._-]{3,30}$')
);

-- A profile row cannot exist before its auth user; the trigger below
-- creates a placeholder username (user_<first 8 of uuid>) that the
-- user replaces in onboarding. Uniqueness is enforced by the PK and
-- the username unique constraint; onboarding PATCH collisions
-- surface as 23505 and are reported as "username already taken".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.email_allowlist
  where email = lower(new.email);
  insert into public.profiles (id, username, role)
  values (
    new.id,
    'user_' || replace(left(new.id::text, 8), '-', ''),
    coalesce(v_role, 'student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Helpers used by every write policy (spec §4.3).
create or replace function public.is_active()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

-- 4. RLS: enable on profiles (eligibility tables were enabled in 0001).
alter table public.profiles enable row level security;

-- Profiles read: signed-in users. Public browsing is OFF, so there
-- is no anonymous read policy. (When public_browsing is turned on
-- in a later phase, add an anon read policy then — not now.)
drop policy if exists profiles_read_signed_in on public.profiles;
create policy profiles_read_signed_in on public.profiles
  for select to authenticated
  using (true);

-- Profiles update: owner only, active only. Column-level protection
-- for role/status is by REVOKE below: authenticated users are
-- granted UPDATE only on the owner-editable columns, so even a
-- policy-passing UPDATE cannot change role or status.
drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles
  for update to authenticated
  using (auth.uid() = id and public.is_active())
  with check (auth.uid() = id and public.is_active());

-- No client insert/delete policy: profiles are created only by the
-- auth trigger (security definer), never directly by clients.

-- Column grants: authenticated may UPDATE only the owner-editable
-- columns (spec §4.3). role, status, onboarded_at and
-- last_verified_at are NOT in this grant: onboarded_at and
-- last_verified_at are set by server routes via the service-role
-- client (PATCH /api/profile and verify-code respectively), never
-- by a direct client UPDATE.
revoke all on public.profiles from authenticated, anon;
grant select on public.profiles to authenticated;
grant update (
  username, full_name, avatar_url, bio, class_section, reduce_effects
) on public.profiles to authenticated;

-- 5. RLS for eligibility tables (0001 enabled RLS but defined no
-- policies). Admin-only read/write, plus the auth-hook role reads.
-- The auth hook runs as supabase_auth_admin; its SELECT grants are
-- below, and the auth_admin_read policies let it read through RLS.
drop policy if exists domains_admin_all on public.allowed_email_domains;
create policy domains_admin_all on public.allowed_email_domains
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists allowlist_admin_all on public.email_allowlist;
create policy allowlist_admin_all on public.email_allowlist
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists settings_admin_all on public.settings;
create policy settings_admin_all on public.settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.allowed_email_domains from authenticated, anon;
revoke all on public.email_allowlist from authenticated, anon;
revoke all on public.settings from authenticated, anon;
grant select, insert, update, delete
  on public.allowed_email_domains to authenticated;
grant select, insert, update, delete
  on public.email_allowlist to authenticated;
grant select, insert, update, delete
  on public.settings to authenticated;
-- Note: the grants above are broad at the table level on purpose
-- because Postgres column/policy checks are the real gate: every
-- policy above requires is_admin(), so a non-admin authenticated
-- user still cannot read or write these tables. Anon has no grant
-- and no policy, so anonymous access is denied.

-- Auth-hook role reads (spec Appendix A.1).
grant select on public.allowed_email_domains to supabase_auth_admin;
grant select on public.email_allowlist to supabase_auth_admin;
grant select on public.settings to supabase_auth_admin;

drop policy if exists auth_admin_read on public.allowed_email_domains;
create policy auth_admin_read on public.allowed_email_domains
  for select to supabase_auth_admin using (true);
drop policy if exists auth_admin_read on public.email_allowlist;
create policy auth_admin_read on public.email_allowlist
  for select to supabase_auth_admin using (true);
drop policy if exists auth_admin_read on public.settings;
create policy auth_admin_read on public.settings
  for select to supabase_auth_admin using (true);

-- 6. Before User Created hook (spec Appendix A.1), university
-- domain only. The allowlist branch is kept (a future real
-- teacher row would pass, and its role is copied by the profile
-- trigger), but roster_mode is false and the domain check is
-- exact-match only because the seeded domain row
-- ('duet.edu.pk', allow_subdomains = false) is the only domain
-- row. The hook itself does NOT hardcode any domain: it reads
-- allowed_email_domains, so @duet.edu.pk passes via that row,
-- @students.duet.edu.pk fails as a subdomain, and a future
-- domain row with subdomains on would allow subdomains — do
-- not add such a row.
-- INSTALL NOTE: this function alone does nothing on live. A human
-- must register it in Supabase Dashboard > Authentication > Hooks >
-- "Before User Created" (Postgres function) after running 0001+0002.
-- It is NOT installed on any live project by this build.
create or replace function public.hook_restrict_signup(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_email  text := lower(trim(event->'user'->>'email'));
  v_local  text := split_part(v_email, '@', 1);
  v_domain text := split_part(v_email, '@', 2);
begin
  if v_email is null or position('@' in v_email) = 0 then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'Please enter your university email address.'));
  end if;

  if position('+' in v_local) > 0 then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'Please use your main university address, without a + alias.'));
  end if;

  -- Roster mode: only listed addresses may sign up. Currently OFF
  -- (settings.roster_mode = false), so this branch is inert.
  if coalesce((select (value #>> '{}')::boolean from public.settings where key = 'roster_mode'), false) then
    if exists (select 1 from public.email_allowlist where email = v_email) then
      return '{}'::jsonb;
    end if;
  elsif exists (select 1 from public.email_allowlist where email = v_email)
     or exists (
       select 1 from public.allowed_email_domains d
       where d.active
         and (v_domain = d.domain
              or (d.allow_subdomains
                  and right(v_domain, length(d.domain) + 1) = '.' || d.domain))
     ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Only approved university email addresses can sign in.'));
end;
$$;

grant execute on function public.hook_restrict_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup(jsonb) from authenticated, anon, public;
