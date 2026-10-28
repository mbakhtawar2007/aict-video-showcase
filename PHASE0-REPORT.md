# Phase 0 Report — AICT AI Video Showcase

**Date:** 2026-10-28 (local build only)
**Scope:** Phase 0 ONLY, per the Phase 0 task. No push, no deploy,
no GitHub repo created, no live Supabase project created, no secrets
stored, no real teacher emails used.

## Files created (hand-written, in `~/workspace/aict-video-showcase/`)

- `package.json` — Next.js 14, React 18, TypeScript 5, Tailwind 3.
- `tsconfig.json` — strict, Next.js bundler resolution.
- `next.config.mjs` — `reactStrictMode: true`, no remote-image config yet.
- `tailwind.config.ts` — Spec §6.2 tokens as Tailwind theme extensions.
- `postcss.config.js` — Tailwind + Autoprefixer.
- `app/layout.tsx` — root layout + metadata.
- `app/page.tsx` — placeholder home page stating Phase 0 only, with
  the locked decisions listed. No routes to login / upload / voting
  exist yet, and none are linked.
- `app/globals.css` — Spec §6.2 design tokens: background `#0B0B14`
  (dark) / `#F7F7FB` (light), off-white text `#EDEDF5`, glass surface,
  primary gradient violet `#7C3AED` → cyan `#22D3EE`, vote accent hot
  pink `#FF3D81`, success / warning / error, radii 12px / 20px /
  999px, 4px-base spacing scale, plus the `prefers-reduced-motion`
  rule (Spec §7.10).
- `lib/motion.ts` — Spec §7.1 tokens: durations 150 / 300 / 600ms,
  eases `cubic-bezier(0.22, 1, 0.36, 1)` and
  `cubic-bezier(0.65, 0, 0.35, 1)`, springs soft (120/14) and snappy
  (400/25), stagger 60ms, page fade + 12px slide, reduced-motion note.
- `.env.example` — placeholder-only values for
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY`, plus commented SMTP placeholders.
- `.gitignore` — `node_modules/`, `.next/`, `.env*` (including
  `.env.local`).
- `supabase/migrations/0001_eligibility.sql` — skeleton for
  `allowed_email_domains`, `email_allowlist`, and `settings` only,
  adapted from `~/workspace/aict-showcase/eligibility-seed.sql`.
  Seeds: domain `students.duet.edu.pk` (`allow_subdomains = false`,
  active), placeholder teacher rows only (`teacher1@duet.edu.pk`,
  `teacher2@duet.edu.pk`, role `admin`), settings
  `roster_mode = false`, `public_browsing = false`,
  `max_votes_per_user = 3`, `voting_open = false`.
- `README.md` — locked decisions, Phase 0 scope, revised Phase 0
  spike checklist (including the MP4 validation design), and what
  Phase 1 builds next.
- `PHASE0-REPORT.md` — this file.

Generated (not hand-written, not counted as deliverables):
`package-lock.json`, `next-env.d.ts`, `tsconfig.tsbuildinfo`,
`node_modules/`, `.next/` (all gitignored where applicable).

## Locked decisions encoded (not re-decided)

- Next.js App Router + TypeScript, Tailwind, Supabase Postgres/Auth.
- Students: `students.duet.edu.pk`, exact match, no subdomains,
  no `+tag` aliases.
- Teachers/admins: `email_allowlist` only, role `admin`, never
  self-service. Roster mode OFF.
- Video (overrides Spec Stream): Supabase Storage free tier, private
  bucket, MP4 (H.264) only, ≤ 50 MB per file, 1 GB total, signed URLs,
  no transcoding, no Stream webhook, no Mux, no R2 for v1.
- Voting defaults noted for later phases: 3 votes, no own-group votes.
- No passwords, no social login. OTP is Phase 1, not Phase 0 code.

## Verification — actually run, not assumed

- `npm install --no-audit --no-fund`: **passed** (105 packages, ~34s).
  Note: the npm registry was reachable in this environment for this
  install, contrary to earlier registry-blocked experience on other
  tasks — this result is specific to this run.
- `npm run typecheck` (`tsc --noEmit`): **passed, exit 0**.
- `npm run build` (Next.js 14.2.35): **passed, exit 0**.
  Route `/` prerendered as static content, 138 B, 87.4 kB first-load JS.
- `node --check`: passed for `next.config.mjs` and `postcss.config.js`.
- `package.json` and `tsconfig.json`: valid JSON (parsed by Node).
- `lib/motion.ts` standalone `tsc --strict`: passed, exit 0.
- Delimiter-balance check on the four TS/TSX files: balanced.
- Secret scan: no real-looking keys, JWTs, or Supabase URLs found;
  only `PLACEHOLDER` values in `.env.example`. No real teacher emails
  anywhere in this directory (only the two placeholder rows).
- "Stream" / "Mux" mentions in this directory are negations only
  ("no Cloudflare Stream", "no Mux"), not code or configuration —
  there is no Stream/Mux client, key, or webhook in the scaffold.

## What was NOT verified (honest limits)

- **The SQL migration was NOT executed against any database.**
  No `psql` / Postgres was available in this environment, and no live
  Supabase project exists yet by design. The migration was reviewed
  for structure (tables, primary keys, checks, seed inserts, RLS
  enabled) but its runtime behaviour is unverified. Run it only
  against the new AICT project, after replacing placeholder teachers.
- **No dev server was left running and no browser check was done.**
  The production build prerendering `/` is the rendering evidence.
- **No Supabase, SMTP, or signed-URL call was made.** There is no
  Supabase client wiring in Phase 0, by design.

## NOT done — needs a human (do not treat Phase 0 as launch-ready)

1. **GitHub repo — created by the user during this task window, push
   still NOT made by this task.** Per the parent's updated record
   (2026-10-28): public `mbakhtawar2007/aict-video-showcase`, empty
   (commits API returns 409 "Git Repository is empty"), created
   2026-10-28T09:55 UTC. What is still to be confirmed by the user:
   adding this repo to the Muse GitHub App installation via Select
   repositories — search visibility alone does not prove App write
   access. No push, commit SHA, or deploy was made from this Phase 0
   task, per its scope.
2. **Live Supabase project** — create a NEW AICT project (never reuse
   GreenKarachi). No project ref, URL, or key exists yet.
3. **Real teacher emails** — replace the two placeholder rows in
   `supabase/migrations/0001_eligibility.sql` before any live run.
4. **Full RLS policies** — Phase 0 enables RLS on the three tables but
   does not define production policies or the `is_active()` /
   `is_admin()` helpers. Those are Phase 1 work; do not rely on this
   migration alone for access control.
5. **Custom SMTP + delivery test** — sending domain with SPF / DKIM /
   DMARC, tested to a real `students.duet.edu.pk` inbox.
6. **Signed-URL + MP4 validation live test** — private `videos`
   bucket, accept good MP4, reject MOV/HEVC, reject > 50 MB, reject
   renamed non-video files. The design is in `README.md`; the code
   is Phase 1/2.
7. **D8 privacy/consent policy** — teacher sign-off, still open from
   the spec decisions log, needed before launch (not before Phase 1).

## Next step (Phase 1, when authorised)

Per spec §13: email-code sign-in, Before User Created domain hook,
allowlist management, rate limits + Turnstile, onboarding, sessions,
and profile pages — after items 1–3 above are done, and after a human
review checkpoint for this Phase 0 scaffold.
