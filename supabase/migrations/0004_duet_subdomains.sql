-- AICT migration 0004 — DUET subdomain rule (2026-10-29).
--
-- DO NOT RUN YET. Local file only. Run in the live Supabase
-- SQL Editor (project aict-video-showcase) only after the user
-- approves, and only against the AICT project — never GreenKarachi.
--
-- Why: the teacher domain is unknown, so the 2026-10-28
-- exact-match rule (allow_subdomains = false for duet.edu.pk)
-- rejects real student addresses on students.duet.edu.pk, which
-- is where real DUET student mail lives (e.g.
-- 26F-CS-052@Students.duet.edu.pk). The new rule is a suffix rule:
-- exactly duet.edu.pk, or any domain ending in ".duet.edu.pk".
--
-- Why no hook reinstall is needed: the Before User Created hook
-- installed from migration 0002 (public.hook_restrict_signup)
-- does NOT hardcode any domain. It reads
-- public.allowed_email_domains and already implements the suffix
-- check: a domain passes if it equals the row's domain OR, when
-- allow_subdomains is true, right(domain, len+1) = '.' || domain.
-- Flipping this flag is therefore enough — the leading-dot check
-- is what keeps fakeduet.edu.pk (no dot before duet) rejected.
--
-- Idempotent: re-running this UPDATE changes nothing on the
-- second run (the row already has the new values).

update public.allowed_email_domains
set allow_subdomains = true,
    active = true
where domain = 'duet.edu.pk';
