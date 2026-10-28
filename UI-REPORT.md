# AICT UI Pass Report — built locally, on top of Phase 1

**Status: LOCAL ONLY. NOT pushed to GitHub, NOT deployed to
Netlify or Vercel, NO migration run, NO real secret/key/teacher
email used.**

This pass answers the user's "Bhai UI to banao sath" — build the
UI alongside the work. Before it, the site was a plain scaffold:
text plus two cards, no nav, no footer, no hero design, and fonts
referenced but not loaded.

## Files changed

- `app/layout.tsx` — shared Navbar (AICT logo mark + "AI Video
  Showcase", links Home / Sign in / Profile) and Footer (project
  name, Phase 1 status, links to the real GitHub repo and Netlify
  site, plus Sign in). Loads Space Grotesk (display) + Inter
  (body) via `next/font/google`, so fonts are bundled at build
  time instead of being referenced-but-missing.
- `app/page.tsx` — home redesign: cinematic hero (large gradient
  headline, subline, CTAs Sign in and View gallery), a How-it-works
  strip (Sign in → Upload in Phase 2 → Vote in Phase 4), a
  Coming-soon gallery section, and the locked decisions restyled
  as compact cards instead of a wall of text. The View-gallery CTA
  is an in-page anchor (`#gallery`), NOT a broken route, because
  no gallery route exists yet.
- `app/globals.css` — design system on top of the unchanged §6.2
  tokens: reusable `.btn-primary` / `.btn-secondary` / `.input` /
  `.card`, nav/footer styles, hero/steps/gallery/decision styles,
  responsive breakpoints (1 column under 640px, 2 columns
  640–1023px, 3 columns at 1024px+, max width 1120px), focus-visible
  states, 44px minimum touch targets, and the Tier 1 fade-up
  animation (600ms entrance, 60ms/120ms stagger). The
  prefers-reduced-motion block is kept and still collapses all
  animation to near-zero.
- `app/login/page.tsx`, `app/login/verify/page.tsx`,
  `app/welcome/page.tsx`, `app/profile/page.tsx` — same design
  system: centered auth card (max 560px), new button/input
  classes, profile rows restyled as a definition list. Only
  markup/classes changed on these pages (see below).
- `README.md` — UI-pass note added.

## Empty-state gallery (no fake content)

The home gallery section says "The gallery arrives in Phase 3.
Nothing here is a real video yet" and shows three generic
"Gallery slot — Coming soon" cards. No invented video titles,
thumbnails, view counts, vote counts or creators.

## Factual text kept accurate

- Phase 1 is sign-in, onboarding and profile only.
- Upload is Phase 2, gallery is Phase 3, voting is Phase 4.
- Domain is `@duet.edu.pk` for both teachers and students, exact
  match, no subdomains, no `+tag`; role comes from the allowlist.
- Teachers are skipped for now; no teacher rows seeded.
- Video is the locked Supabase Storage MP4 free path (≤ 50 MB,
  1 GB total, signed URLs, no transcoding, no Cloudflare Stream).
- Sign-in is not live yet: no live Supabase project, so the login
  page will report Supabase as not configured until connected.

## Deliberately NOT changed

- Auth logic: no change to `app/api/*` routes, `lib/supabase/*`,
  `lib/email.ts`, `lib/validation.ts`, `lib/rate-limit.ts`, or
  `middleware.ts`. The auth pages' fetch calls, state handling,
  redirects and validation behaviour are untouched; only CSS
  classes and the profile list markup changed.
- Migrations: `0001_eligibility.sql` and `0002_profiles_rls.sql`
  untouched.
- Domain rules, tokens and motion values: §6.2 token colours and
  §7.1 durations/eases/springs in `lib/motion.ts` unchanged.
- No new dependency: Framer Motion was NOT added. The task allowed
  it only if it built cleanly in a static export; CSS animations
  using the §7.1 values already deliver the Tier 1 effect with
  zero dependency risk. No GSAP scroll storytelling, tilt,
  parallax, marquee or confetti — those are Tier 2 and are
  explicitly out of this pass.
- Source `next.config.mjs` untouched. The static-export config
  lives only in the staging copy used for verification.

## Verification — actually run (see parent report for outputs)

- `npm test` — existing email-rule tests pass.
- `npm run typecheck` — exit 0.
- `npm run build` — exit 0.
- Static-export build in a workspace staging copy (not /tmp):
  home, login, login/verify, profile and welcome pages export;
  API routes/middleware are disabled by `next export` itself,
  which is the known limitation of the static Netlify preview —
  it does not change the source app.
- Overflow/contrast checked by reading the CSS: 1-column grids
  under 640px, full-width hero CTAs on mobile, `overflow-wrap`
  on headings/code/profile values, off-white `#EDEDF5` body text
  on `#0B0B14` (unchanged tokens), 44px touch targets, visible
  cyan focus rings. No browser screenshot tool was used.

## Honest limits

- No browser/screenshot check was run; mobile behaviour was
  checked from the CSS breakpoints only, not on a real device.
- The static-export preview cannot run API routes or middleware,
  so sign-in on a static Netlify deploy still cannot send a code
  — that needs the live Supabase project and the Vercel server.
- The gallery, upload and voting UIs do not exist yet; only
  honest placeholders and phase labels are shown for them.
- NOT pushed, NOT deployed. The live Netlify/Vercel sites still
  serve the pre-UI-pass Phase 1 pages until a human approves a
  push and redeploy.
