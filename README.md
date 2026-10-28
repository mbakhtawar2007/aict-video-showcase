# AICT AI Video Showcase & Voting Website

**Status: Phase 0 scaffold only.** No sign-in, upload, gallery, voting,
live database, deploy, or GitHub push yet. Work proceeds phase by phase;
each phase is pushed to GitHub only after a human review checkpoint.

Source of truth: Developer Specification v1.1
(`~/workspace/user/files/AICT_AI_Video_Showcase___Voting_Website_Developer_Spec_v1.1.md`),
as overridden for video by
`~/workspace/aict-showcase/supabase-free-video-delta.md`.

## Locked decisions (do not re-decide without a new explicit decision)

- **Stack:** Next.js App Router + TypeScript, Tailwind CSS
  (+ shadcn/ui style), Supabase Postgres / Auth. Frontend hosting per
  spec: Vercel (a later-phase decision, not a Phase 0 action).
- **Students:** `students.duet.edu.pk` only, exact match,
  `allow_subdomains = false`, no `+tag` aliases. Login hint:
  `name@students.duet.edu.pk`.
- **Teachers / admins:** `email_allowlist` only, role `admin`, seeded
  by a human — never self-service. Teacher addresses on the parent
  `duet.edu.pk` do NOT pass on the student domain alone.
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
  with a real `students.duet.edu.pk` account, after the project exists.
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
- [ ] [live] **Real teacher emails** — replace the placeholder rows in
  `supabase/migrations/0001_eligibility.sql` before any live run.
- [x] ~~Stream account and test upload~~ — REMOVED by the free-video
  decision. Do not create a Stream account for v1.

## What Phase 1 will build next

Per spec §13 Phase 1 (4 days): email-code sign-in, domain hook
(Before User Created, enforcing the domain + allowlist + `+tag`
rejection), allowlist management, rate limits + Turnstile, onboarding,
sessions, and profile pages — on the new AICT Supabase project, once
it exists and the real teacher list is supplied. Phase 1 must also add
the full RLS policies and `is_active()` / `is_admin()` helpers; the
Phase 0 migration enables RLS but does not yet define production
policies, and must not be relied on alone.

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

## Project structure (Phase 0)

```
app/
  layout.tsx        Root layout + metadata
  page.tsx          Placeholder home page (Phase 0 only)
  globals.css       Spec §6.2 design tokens
lib/
  motion.ts         Spec §7.1 motion tokens
supabase/
  migrations/
    0001_eligibility.sql   Domain / allowlist / settings skeleton
.env.example        Placeholder-only env
PHASE0-REPORT.md    Files created, verification, human checklist
```
