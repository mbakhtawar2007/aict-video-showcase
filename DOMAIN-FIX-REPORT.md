# AICT domain fix — LOCAL ONLY

**Status: LOCAL ONLY. NOT pushed to GitHub, NOT deployed, NO
migration run against any live database, NO auth logic changed
beyond the domain check, NO teacher emails invented.**

## Why

User decision 2026-10-29 (Roman Urdu, in substance: "I don't
actually know the teachers' domain — the only requirement is
that it must end in .duet.edu.pk"). The 2026-10-28 exact-match
rule (`duet.edu.pk` only, subdomains rejected) therefore blocked
real students: the user's own address is
`26F-CS-052@Students.duet.edu.pk`, a DUET subdomain, and the
live login page rejected it with "Only duet.edu.pk addresses
can sign in." before any OTP was sent. This was the rule
working as written, not a Supabase or hook failure.

## Rule before / after

- **Before (2026-10-28):** domain, after lowercasing/trimming,
  must equal `duet.edu.pk` exactly. `students.duet.edu.pk` and
  every other subdomain rejected.
- **After (2026-10-29, this change):** domain, after
  lowercasing/trimming, passes iff it is exactly `duet.edu.pk`
  OR ends with `.duet.edu.pk` (e.g. `students.duet.edu.pk`,
  `dept.duet.edu.pk`, any other real DUET subdomain).
- **Still rejected:** any other domain; lookalikes with no dot
  before `duet` (`fakeduet.edu.pk`); suffix tricks
  (`duet.edu.pk.evil.com`); unrelated domains (`notduet.edu.pk`,
  `gmail.com`); `+tag` aliases in the local part; malformed
  addresses. Teachers vs students are still distinguished ONLY
  by `email_allowlist` role, never by domain.
- **Hook alignment:** the live Before User Created hook from
  migration 0002 (`public.hook_restrict_signup`) does NOT
  hardcode a domain — it reads `allowed_email_domains` and
  already implements the suffix check
  (`right(domain, len+1) = '.' || domain` when
  `allow_subdomains` is true). So the live fix is only the
  0004 flag flip below; no hook reinstall is needed.

## Files changed

- `lib/email.ts` — exact-equality check replaced with the
  suffix rule (`domain === UNIVERSITY_DOMAIN ||
  domain.endsWith('.' + UNIVERSITY_DOMAIN)`); header comment
  rewritten to the new rule; error message now "Only addresses
  ending in .duet.edu.pk can sign in." `STUDENT_DOMAIN` /
  `UNIVERSITY_DOMAIN` exports unchanged.
- `scripts/test-email-rules.mjs` — 8 cases added, 2 changed:
  - Changed (contradicted the old rule, correct under the new
    one): `ali@students.duet.edu.pk` and
    `ali@sub.duet.edu.pk` — were reject, now pass.
  - Added (pass): `ali@dept.duet.edu.pk`,
    `26F-CS-052@Students.duet.edu.pk` (normalization: uppercase
    subdomain lowercased, passes).
  - Added (reject): `ali@fakeduet.edu.pk`,
    `ali@notduet.edu.pk`, `ali@gmail.com`,
    `ali+tag@students.duet.edu.pk` (`+tag` still rejected even
    on a passing subdomain).
  - Unchanged: parent-domain pass, uppercase/whitespace
    normalization, `duet.edu.pk.evil.com` reject, malformed
    addresses, placeholder-teacher domain passes (role is an
    allowlist matter, not a domain matter).
- `app/login/page.tsx` — hint now: "any address ending in
  .duet.edu.pk (for example name@students.duet.edu.pk) — no
  +tag aliases"; placeholder changed to
  `name@students.duet.edu.pk`.
- `app/page.tsx` — How-it-works step 1 and the Domain decision
  card now say "ending in .duet.edu.pk" with
  `@students.duet.edu.pk` as the example; no other UI changed.
- `README.md` — Locked-decisions domain bullet and status line
  updated to the suffix rule and migration 0004.
- `supabase/migrations/0004_duet_subdomains.sql` — NEW, local
  file only, DO NOT RUN yet (see SQL below).

Deliberately NOT changed: everything under `app/api/`,
`middleware.ts`, migrations 0001–0003, `lib/` other than
`email.ts`, `next.config.mjs`, `.env.example`, `package.json`.

## Verification (actually run, local only)

- `npm test`: **38/38 pass** — email rules 20/20 (was 14),
  video rules 18/18, 0 failures.
- `npm run typecheck`: **exit 0**.
- `npm run build`: **exit 0** ("Compiled successfully",
  18 static pages generated).
- Operative-copy grep for "no subdomains" /
  "Only duet.edu.pk addresses" across `app/`, `README.md`,
  `lib/`: **no matches** (grep exit 1).
- Historical comments left as-is (dated reports, not live
  copy): `supabase/migrations/0001` and `0003` header
  comments, `PHASE0/1/2-REPORT.md`, `UI-REPORT.md`. These
  describe the superseded rule at the time and are not read
  by the app.

## Migration 0004 — exact SQL (review before running)

Run in the live Supabase SQL Editor (project
`aict-video-showcase`) ONLY after user approval, and only
against the AICT project — never GreenKarachi. Idempotent
(re-running changes nothing). Full file:
`supabase/migrations/0004_duet_subdomains.sql`.

```sql
update public.allowed_email_domains
set allow_subdomains = true,
    active = true
where domain = 'duet.edu.pk';
```

After 0004 runs AND the code is pushed/deployed (Vercel
auto-deploys on push to main), retest with
`26F-CS-052@Students.duet.edu.pk`: the domain check should
pass and a 6-digit OTP should be sent. If the code still does
not arrive after that, the problem is Supabase email delivery
(template/SMTP), not the domain rule.

## Honest limits

- No live database was touched: 0004 has NOT run, so the live
  hook still enforces the old exact-match rule until it does.
- No OTP has been sent or tested yet — that test is still
  blocked until 0004 runs and the new code deploys.
- The teacher domain is still unknown; this rule deliberately
  accepts ANY `.duet.edu.pk` subdomain rather than guessing
  one. If a teacher later confirms a specific subdomain, it
  is already covered by this rule.
