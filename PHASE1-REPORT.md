# AICT Phase 1 Report — built locally, teachers and students on @duet.edu.pk

**AMENDMENT 2026-10-28 — domain change (user decision, supersedes
the original Phase 1 domain): the single allowed university domain
is now `duet.edu.pk` for BOTH teachers and students, exact match,
`allow_subdomains=false`, no `+tag` aliases. Teachers are
distinguished ONLY by `email_allowlist` role `admin`; students
default to student. `@students.duet.edu.pk` is now REJECTED as a
subdomain. The body below has been updated to the new domain;
the original Phase 1 run's verification (which used the old
domain) is superseded by the re-run in the Verification section.
`PHASE0-REPORT.md` is left untouched as the Phase 0 historical
record — its `students.duet.edu.pk` lines are superseded by this
amendment.**

**Status: LOCAL ONLY. NOT pushed to GitHub, NOT deployed to Netlify
or Vercel, NO migration run against any live database, NO real
secret/key/teacher email used or invented.**

Phase 0 is on GitHub (`mbakhtawar2007/aict-video-showcase`, `main` @
`62df5745`). Phase 1 below lives only in `~/workspace/aict-video-showcase/`
until a human review checkpoint approves a push/deploy.

## Scope (spec §5.1, §4.2–4.3, Appendix A.1, teachers and students on @duet.edu.pk)

- Passwordless OTP only: no passwords, no social login.
- Teachers and students on `duet.edu.pk`, exact match,
  `allow_subdomains=false`, no `+tag` aliases, `roster_mode=false`,
  `public_browsing=false`. Role comes from `email_allowlist`
  (admin) or defaults to student — never from the domain.
- **Teachers skipped (user decision 2026-10-28):** migration 0002
  deletes the two placeholder teacher rows from 0001 and seeds no
  teacher/admin row. Teacher/admin accounts are added later, when
  real teacher emails arrive, as `email_allowlist` rows with role
  `admin` — never as a domain bypass.
- Hosting split for later phases (frontend Netlify, server Vercel,
  Supabase backend) is recorded in README only. No hosting config
  was changed; the code stays as one Next.js app with API routes.

## Files added

- `lib/email.ts` — pure university-domain rules: trim/lowercase,
  exactly one `@`, no `+` in local part, domain must equal
  `duet.edu.pk` (subdomains — including `students.duet.edu.pk` —
  and lookalikes rejected). Domain check only; role is separate.
  Also `isPlaceholderSupabaseEnv()`.
- `lib/supabase/client.ts` — browser client via `@supabase/ssr`.
- `lib/supabase/server.ts` — server client, HTTP-only cookie sessions.
- `lib/supabase/admin.ts` — service-role client, server only, returns
  null when unconfigured (never imported from client components).
- `lib/rate-limit.ts` — in-memory per-email (5/15 min) and per-IP
  (20/15 min) limiter for request-code. Process-local only.
- `lib/validation.ts` — Zod schemas: email, 6-digit code, onboarding
  (username 3–30, `[A-Za-z0-9._-]`, full name ≤100, class section ≤50).
- `middleware.ts` — session refresh; passes through unchanged on
  placeholder env, swallows refresh errors instead of 500ing.
- `app/api/health/route.ts` — `GET` → `{ok:true, service}`.
- `app/api/auth/request-code/route.ts` — `POST`: normalize → domain
  check → rate limits → Turnstile only when `TURNSTILE_SECRET_KEY`
  is set → `signInWithOtp` when configured. With placeholder env
  it returns `{ok:true, configured:false}` and sends nothing.
- `app/api/auth/verify-code/route.ts` — `POST`: `verifyOtp` (type
  email), best-effort `last_verified_at` update via service role,
  returns `onboarded` flag. Placeholder env → `configured:false`.
- `app/api/auth/sign-out/route.ts` — `POST`, idempotent sign-out.
- `app/api/profile/route.ts` — `GET` own profile; `PATCH` onboarding
  / owner-editable columns only (username, full_name,
  class_section via this route; avatar_url/bio/reduce_effects are
  RLS-granted but not yet exposed in the UI). `role`/`status` are
  never accepted. Username collision → 409. `onboarded_at` is set
  via the service-role client on first PATCH (it is not an
  owner-editable column in RLS). Without a service key, fields
  save but the user stays onboarding-pending — a live-env config
  gap, documented here, not a silent success.
- `app/login/page.tsx` — email entry, domain hint, placeholder-env
  notice instead of a fake redirect.
- `app/login/verify/page.tsx` — 6-digit code entry; routes to
  `/welcome` or `/profile` based on `onboarded`.
- `app/welcome/page.tsx` — first-sign-in onboarding form.
- `app/profile/page.tsx` — own profile display + sign-out.
- `supabase/migrations/0002_profiles_rls.sql` — see below.
- `scripts/test-email-rules.mjs` — email-rule tests (node:test).
- `PHASE1-REPORT.md` — this file.

## Files changed

- `package.json` — added `@supabase/supabase-js`, `@supabase/ssr`,
  `zod`; added `test` script (`node scripts/test-email-rules.mjs`).
  `package-lock.json` updated by `npm install` accordingly.
- `app/page.tsx` — Phase 1 heading/link to `/login`; teachers line
  now says SKIPPED FOR NOW. No other Phase 0 content changed.
- `app/globals.css` — appended Phase 1 form/button/notice styles
  only; Phase 0 tokens and reduced-motion rule untouched.
- `app/layout.tsx`, `lib/motion.ts` — untouched.
- `.env.example` — Phase 1 header; added commented Turnstile and
  Upstash placeholders (live-only, no real keys).
- `README.md` — status, Phase 1 scope, structure, teacher item
  marked deferred, hosting-split note.

## Migration 0002 (`supabase/migrations/0002_profiles_rls.sql`)

- Deletes `teacher1@duet.edu.pk` and `teacher2@duet.edu.pk` from
  `email_allowlist` (the 0001 placeholders). Seeds nothing.
- `profiles` per spec §4.1: `id uuid PK references auth.users on
  delete cascade`, unique `username` (3–30 format check),
  `full_name`, `avatar_url`, `bio`, `class_section`,
  `role student/admin default student`, `status active/suspended
  default active`, `onboarded_at`, `last_verified_at`,
  `reduce_effects default false`, `created_at`.
- Trigger `on_auth_user_created` on `auth.users`: creates the
  profile row, role copied from `email_allowlist` if present,
  otherwise `student`, placeholder username `user_<uuid8>`
  replaced in onboarding.
- `is_active()` and `is_admin()` helpers (spec §4.3).
- RLS: profiles readable by signed-in users only (no anon read,
  since `public_browsing=false`); owner update, active only, with
  column grants limited to username/full_name/avatar_url/bio/
  class_section/reduce_effects — `role`/`status`/`onboarded_at`/
  `last_verified_at` are not owner-grantable. No client insert/
  delete policy (trigger only). Eligibility tables: admin-only
  policies (policy check `is_admin()`), plus `auth_admin_read`
  policies and SELECT grants for `supabase_auth_admin`.
- Before User Created hook `hook_restrict_signup` adapted from
  Appendix A.1: null/missing email → 400, `+` local part → 400,
  allowlist or active exact/subdomain domain row → pass (with
  the seeded student row, `allow_subdomains=false`, so only the
  exact domain passes), otherwise 403. Roster branch kept but
  inert while `roster_mode=false`. Grants to `supabase_auth_admin`;
  revoked from authenticated/anon/public.

## Verification — actually run (2026-10-28, local)

- `npm install` — passed (12 packages added: Supabase + Zod).
- `npm test` (`node scripts/test-email-rules.mjs`) — **14/14 pass,
  0 fail** (re-run after the 2026-10-28 domain change; the
  original run under `students.duet.edu.pk` is superseded).
  Cases include: valid `duet.edu.pk` address, case/whitespace
  normalization, `+tag` rejection, `students.duet.edu.pk`
  rejection (now a subdomain), other-subdomain rejection,
  lookalike-domain rejection, malformed addresses, and both
  placeholder teacher addresses PASSING the domain check only
  (their admin role is an allowlist matter, and migration 0002
  still deletes those placeholder rows).
  (The test imports the real `lib/email.ts` implementation.)
- `npm run typecheck` (`tsc --noEmit`) — **exit 0**.
- `npm run build` (Next.js 14.2.35) — **exit 0**. Routes built:
  `/`, `/_not-found`, `/login`, `/login/verify`, `/profile`,
  `/welcome` (static), `/api/health` (static),
  `/api/auth/request-code`, `/api/auth/verify-code`,
  `/api/auth/sign-out`, `/api/profile` (dynamic), plus middleware.
  First-load JS: `/` 87.4 kB, auth/profile pages ~97 kB.
- Local production server check (`next start -p 3101`, placeholder
  env, no live project): `GET /api/health` → `{"ok":true,
  "service":"aict-video-showcase"}`; `POST /api/auth/request-code`
  with `ali@students.duet.edu.pk` → error "Only duet.edu.pk
  addresses can sign in."; same route with a `duet.edu.pk`
  address →
  `{ok:true, configured:false, message:"Supabase is not configured
  yet (placeholder env). No code was sent."}`; `/login` page
  renders with the AICT title.
- Secret scan (changed files, excluding `node_modules/.next`):
  no real-key patterns found (no JWT, no `sk-`, no AWS/GH keys,
  no non-placeholder Supabase keys). Only placeholders appear
  (`PLACEHOLDER.*` in `.env.example` and placeholder-detection
  code). Placeholder teacher strings appear only in: 0001
  (pre-existing seeds), 0002 (the DELETE), and the test's
  rejection cases. No `.env.local` file was created; the local
  server check used inline env vars.

## Honest limits — what was NOT done or verified

- **No live Supabase project exists yet.** No migration (0001 or
  0002) was executed against any database, and RLS policies, the
  profile trigger, `is_active()`/`is_admin()`, and the auth hook
  have NOT been tested against live Postgres. They are SQL text
  reviewed against the spec, not a passing live test.
- **No SMTP delivery test.** No OTP email was sent to any real
  inbox. The Supabase Auth email-OTP template setting (code vs
  magic link) must be confirmed in the dashboard when the project
  is created; `signInWithOtp` alone does not guarantee a 6-digit
  code email.
- **No Turnstile live test, no Upstash.** Turnstile verification
  runs only when a secret key is configured; Upstash is not
  implemented — the in-memory limiter will not share state across
  Vercel serverless instances. Both are live-env steps.
- **No sign-in end-to-end test** (no live project, no real
  student inbox). The verify/onboarding/profile flows are built
  and type-checked, but their Supabase round-trips are untested.
- **No push, no deploy.** Nothing in this report was pushed to
  GitHub or deployed to Netlify/Vercel. The next human checkpoint
  should review this report + the diff, then approve push/deploy
  separately.
- **Hook not installed.** Defining `hook_restrict_signup` in
  migration 0002 does not install it. A human must register it
  under Authentication > Hooks > Before User Created in the
  Supabase dashboard after running the migrations.
- **Service-role key required for full onboarding.** Without it,
  `onboarded_at`/`last_verified_at` updates are skipped (sign-in
  itself still succeeds). Set `SUPABASE_SERVICE_ROLE_KEY` only
  on the server (Vercel) when the live project exists.
- **Admin UI absent by design in Phase 1.** Admins are skipped
  with teachers; there is no allowlist/domain management page
  yet (Phase 6 scope). Admin RLS policies exist so a future
  admin row works without a migration change.
- **Avatar/bio/reduce_effects editing** is RLS-granted but has no
  UI yet; the onboarding PATCH only writes username/full_name/
  class_section. Profile display shows the other fields.

## Human checklist before any live run

1. Create the NEW AICT Supabase project (never GreenKarachi).
2. Run `0001` then `0002` against it, in that order.
3. Register `hook_restrict_signup` as the Before User Created hook.
4. Confirm Auth email-OTP (6-digit code) templates are enabled.
5. Set up custom SMTP (SPF/DKIM/DMARC) and test delivery to a
   real `duet.edu.pk` inbox.
6. Set server env on Vercel (and public env on Netlify for the
   frontend): real Supabase URL/anon key, service-role key
   (server only), Turnstile keys if enabled.
7. When real teacher emails arrive, insert them into
   `email_allowlist` with role `admin` — do not re-add the
   placeholder rows. The domain row is already `duet.edu.pk`
   (2026-10-28 change); do not add a `students.duet.edu.pk`
   domain row or any subdomain row.
8. Only then: review checkpoint → push Phase 1 → deploy
   frontend (Netlify) and server (Vercel) → live sign-in test
   with a real student account.
