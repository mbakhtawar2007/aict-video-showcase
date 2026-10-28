# AICT AI Video Showcase & Voting Website

**Status: Phase 1 built locally, teachers and students on
`@duet.edu.pk` (domain change 2026-10-28) — NOT pushed, NOT
deployed, NO live database yet.** Phase 0 is on GitHub (`main` @
`62df5745`); Phase 1 below is local only, pending a human review
checkpoint before any push or deploy. Work proceeds phase by phase.

Source of truth: Developer Specification v1.1
(`~/workspace/user/files/AICT_AI_Video_Showcase___Voting_Website_Developer_Spec_v1.1.md`),
as overridden for video by
`~/workspace/aict-showcase/supabase-free-video-delta.md`.

## Locked decisions (do not re-decide without a new explicit decision)

- **Stack:** Next.js App Router + TypeScript, Tailwind CSS
  (+ shadcn/ui style), Supabase Postgres / Auth. Later-phase
  hosting split (user decision 2026-10-28): frontend Netlify,
  server Vercel, Supabase backend. This Phase 1 build is LOCAL
  ONLY and stays as one Next.js app with API routes; no hosting
  config was changed for a deploy.
- **Teachers and students:** `duet.edu.pk` only, exact match,
  `allow_subdomains = false`, no `+tag` aliases. Login hint:
  `name@duet.edu.pk`. (Domain change 2026-10-28, superseding the
  earlier `students.duet.edu.pk` rule; that subdomain is now
  rejected.)
- **Teachers / admins:** distinguished ONLY by `email_allowlist`
  role `admin`, seeded by a human — never self-service, never by
  a separate domain. Everyone else on `duet.edu.pk` is a student.
- **Roster mode:** OFF. A student does not also need an allowlist row.
  Switching to roster-only later is a separate decision and needs the
  full class roster CSV.
- **Public browsing:** OFF by default (members only, per spec §1.4 D4).
- **Auth:** Passwordless only. University email + 6-digit code, every
  new session. **No passwords, no social login.** OTP code is Phase 1,
  not Phase 0.
- **Voting defaults (for later phases, noted here only):** 3 votes per
  student, no voting for your own or your group's video, removable
  while voting is open, enforced in Postgres by `cast_vote`.
- **Video — LOCKED free path (overrides Spec §2 / §5.2 Stream):**
  Supabase Storage free tier, private bucket, MP4 (H.264) only,
  **≤ 50 MB per file, 1 GB total, signed URLs, no transcoding,
  no Cloudflare Stream, no Mux, no R2 for v1.**
  Recommended student guidance: aim ≤ 20 MB, ≤ 2 minutes, 720p.
  The spec's 500 MB / 10-minute defaults do NOT apply on this path.

## Phase 0 scope (this scaffold)

- Next.js scaffold: `package.json`, `tsconfig.json`, `next.config.mjs`,
  Tailwind + PostCSS config, `app/layout.tsx`, placeholder `app/page.tsx`.
- Design tokens in `app/globals.css` (Spec §6.2) and motion tokens in
  `lib/motion.ts` (Spec §7.1), including the reduced-motion rule.
- `.env.example` with placeholder-only values. No real keys anywhere.
- `supabase/migrations/0001_eligibility.sql`: skeleton for
  `allowed_email_domains`, `email_allowlist`, and `settings` only,
  adapted from the eligibility seed with placeholder teacher rows.
- This README and `PHASE0-REPORT.md`.

Phase 0 deliberately does NOT include: auth routes, upload wizard,
gallery, watch page, voting, leaderboard, admin panel, comments,
Supabase client wiring, or any live service call.

## Revised Phase 0 spike checklist

The spec's Phase 0 spikes (§13) are revised for the free-video decision.
Items marked [design] are specified here; items marked [live] still
need a human-owned live service and are NOT done in this scaffold.

- [ ] [live] **New Supabase project** — separate from GreenKarachi.
  Create it by a human; this scaffold contains no project ref.
- [ ] [live] **Private `videos` Storage bucket + signed-URL test** —
  with a real `duet.edu.pk` account, after the project exists.
- [design] **MP4 validation design (for Phase 1/2 implementation):**
  1. Client checks file type and size before upload (MP4, ≤ 50 MB).
  2. Server re-checks MIME type AND magic bytes after upload; a
     renamed non-video file is rejected and its object deleted.
  3. Reject MOV / HEVC / WebM with: "Export as H.264 MP4 and try again."
  4. Only after validation passes does the project become
     `video_status = 'ready'` and publishable (Spec §4.2 check:
     published requires ready, enforced in the database, not only UI).
  5. Playback is progressive MP4 via a short-lived signed Storage URL,
     issued by the server only after the members-only / published
     access check. No adaptive HLS on this path.
  6. Admin panel (later phase) shows Storage used / 1 GB, warns at
     80%, and blocks new publishes at 100% until archiving/deletion.
- [ ] [live] **Custom SMTP + delivery test to a real university inbox**
  — sending domain with SPF / DKIM / DMARC, per spec §2 / §5.1.
  Built-in Supabase email is not for production.
- [ ] [deferred 2026-10-28] **Real teacher emails** — SKIPPED FOR NOW.
  Phase 1 seeds no teacher rows; `0002` deletes the placeholder
  rows from 0001. Real teacher emails are added later, when supplied,
  as allowlist rows with role `admin` — never as a domain bypass.
- [x] ~~Stream account and test upload~~ — REMOVED by the free-video
  decision. Do not create a Stream account for v1.

## Phase 1 scope (built locally, students only)

Per spec §13 Phase 1, adapted 2026-10-28: teachers are SKIPPED FOR
NOW, so Phase 1 is students-only and is not blocked on teacher
emails. See `PHASE1-REPORT.md` for the full file list, verification
outputs and honest limits.

- Supabase clients (`@supabase/ssr` + `@supabase/supabase-js`):
  browser client, server client with HTTP-only cookie sessions,
  service-role client (server only, null when unconfigured), and
  session-refresh middleware. Env placeholders only in `.env.example`.
- Auth UI: `/login` (email entry), `/login/verify` (6-digit code),
  sign-out, `/welcome` onboarding (username/full name/class
  section), `/profile` (own profile).
- API routes: `POST /api/auth/request-code` (normalize, student
  domain check, per-email/per-IP in-memory rate limits, Turnstile
  env-gated for live only, `signInWithOtp` when configured),
  `POST /api/auth/verify-code` (`verifyOtp`, updates
  `last_verified_at` via service role when configured),
  `POST /api/auth/sign-out`, `GET/PATCH /api/profile`
  (owner-editable columns only; `role`/`status` never accepted),
  `GET /api/health`.
- Migrations: `0002_profiles_rls.sql` — `profiles` table per spec,
  auth trigger (role from allowlist, default `student`),
  `is_active()` / `is_admin()`, RLS for profiles and eligibility
  tables, and the Before User Created hook
  `hook_restrict_signup` (students-domain-only). **0002 also
  deletes the two placeholder teacher rows from 0001 and seeds no
  teacher/admin row.** The hook is NOT installed on any live
  project by this build; a human must register it in the Supabase
  dashboard after running 0001+0002 on the new AICT project.
- Validation: Zod schemas for email/code/onboarding; pure
  `lib/email.ts` student-domain rules, covered by
  `scripts/test-email-rules.mjs` (14 tests).

## What Phase 1 deliberately does NOT do

- No GitHub push, no Netlify/Vercel deploy, no migration run
  against any live database, no live Supabase project, no SMTP
  delivery test, no live Turnstile/Upstash, no teacher/admin
  seeding. The in-memory rate limiter is process-local only; on
  live serverless it must be supplemented by Upstash (see
  `PHASE1-REPORT.md`). RLS and the hook have not been tested
  against live Postgres.

## Run locally (after dependencies are installed)

```bash
cp .env.example .env.local   # placeholders only — will not connect yet
npm install
npm run dev
```

Then open the local address printed by Next.js. Expect only the
Phase 0 placeholder home page. See `PHASE0-REPORT.md` for what was
actually verified in this environment (do not assume a build passed
unless that report says it ran).

## Project structure (Phase 0 + Phase 1)

```
app/
  layout.tsx        Root layout + metadata
  page.tsx          Home page (Phase 1 link to /login)
  globals.css       Spec §6.2 design tokens + Phase 1 form styles
  login/page.tsx    Email entry (passwordless only)
  login/verify/page.tsx  6-digit code entry
  welcome/page.tsx  First-sign-in onboarding
  profile/page.tsx  Own profile + sign-out
  api/health/route.ts
  api/auth/request-code|verify-code|sign-out/route.ts
  api/profile/route.ts
lib/
  motion.ts         Spec §7.1 motion tokens (Phase 0, untouched)
  email.ts          Student-domain rules (pure, tested)
  rate-limit.ts     In-memory per-email/per-IP limiter
  validation.ts     Zod schemas
  supabase/client.ts|server.ts|admin.ts
middleware.ts       Session refresh (passes through on placeholders)
scripts/
  test-email-rules.mjs   14 email-rule tests (node:test)
supabase/
  migrations/
    0001_eligibility.sql   Domain / allowlist / settings skeleton
    0002_profiles_rls.sql  Profiles, RLS, hook; deletes placeholder
                           teacher rows, seeds none
.env.example        Placeholder-only env
PHASE0-REPORT.md    Phase 0 files, verification, human checklist
PHASE1-REPORT.md    Phase 1 files, verification, honest limits
```
