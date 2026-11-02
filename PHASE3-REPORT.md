# AICT AI Video Showcase — Phase 3 Report (Gallery + Watch)

**Scope: LOCAL ONLY.** Built 2026-11-02 in `~/workspace/aict-video-showcase/`.
Nothing was pushed to GitHub, nothing was deployed to Netlify or
Vercel, no migration was run, and no live database (AICT or
GreenKarachi) was touched. This report is the handoff for the
review checkpoint before any push/deploy.

**Spec basis:** v1.1 §5.3 (gallery), §5.4 (detail/watch), §6.4/§9
(API), adapted to the LOCKED free-video path: Supabase Storage,
MP4 (H.264) only, ≤ 50 MB, 1 GB total, private `videos` bucket,
signed URLs, no transcoding, no Cloudflare Stream / Mux / HLS.
Domain rule untouched: any address ending in `.duet.edu.pk`.

## What was built

### 1. `/explore` gallery page (`app/explore/page.tsx`)
- Responsive card grid (existing `.gallery-grid`: 3 cols desktop,
  2 tablet, 1 mobile) with thumbnail, title, creator/group,
  genre chip, vote count (read-only), duration badge (`m:ss`).
- Search by title / creator name / character name (300 ms
  debounce), filters by genre / tool used / group, sort by
  Newest / Most Voted / Trending / Most Viewed.
- Cursor pagination via a "Load more" button (page size 12),
  skeleton-shimmer placeholders while loading and while loading
  more, shared `.empty-state` for empty results.
- Featured "Current leader" strip on the first unfiltered page
  ONLY when a published project with `vote_count > 0` really
  exists. There is no teacher-picks field in the schema, so no
  teacher-picks strip is shown or faked.
- **No fake data anywhere:** with zero published projects the
  page says plainly "Nothing is published yet" (or, with filters
  active, "No published videos match those filters"). The old
  home-page "Gallery slot" placeholder cards were removed.
- No vote button, no comments section (Phase 4 / Phase 6).

### 2. `/watch/[slug]` detail page (`app/watch/[slug]/page.tsx`, `watch-client.tsx`)
- Progressive MP4 playback via a server-minted, 1-hour signed
  URL from the private bucket, in a native `<video>` element
  (play/pause, scrub, volume, speed, fullscreen, PiP all native).
  Added on top: keyboard shortcuts (Space/K, ←/→ ±10 s, ↑/↓
  volume, M mute, F fullscreen, P PiP) and per-slug position
  memory in `localStorage` (restores on load, best-effort).
- Sections (anchor nav, not fake tabs): Overview, Story,
  Characters, Behind the Scenes (concept + prompts notes +
  caption languages listed, not played), Credits (creator,
  group, genre, tools, published date, read-only vote count).
- Related videos strip: same-genre published projects first,
  newest first, max 6, excluding the current video.
- Share button: native share sheet where available, otherwise
  copies the link to the clipboard (with a prompt fallback).
- Story/description/concept are rendered as **escaped plain
  text** (`whiteSpace: pre-wrap`), NOT markdown HTML: this app
  has no HTML sanitizer dependency, and rendering stored
  markdown as HTML without one would be an injection hole.
  Markdown rendering waits on a sanitizer (follow-up, not a
  Phase 3 blocker).
- No voting UI, no comments UI. Vote count is display-only.

### 3. API — gallery + slug detail + playback
- `GET /api/projects?gallery=true&query&genre&tool&group&sort&cursor&limit`
  — published rows only, for every viewer. Sorts: newest
  (`created_at` desc), most_voted (`vote_count` desc),
  most_viewed (`view_count` desc), trending (see limits).
  Cursor is an opaque base64url JSON keyset (primary sort key +
  `created_at` + `id`, all descending); a malformed or
  cross-sort cursor returns 400, never silently page one.
  Response includes `projects`, `nextCursor`, `facets`
  (distinct genres / tools / groups from the published
  catalog), `featured`, and `publicBrowsing`.
- `GET /api/projects?slug=<slug>` — project detail with
  characters, captions, group name, creator name.
- **Detail-route choice (documented):** spec §9 names
  `GET /api/projects/:slug`, but this app already has
  `/api/projects/[id]` (uuid). A `[slug]` segment alongside
  `[id]` would be ambiguous, so detail is a `?slug=` query
  param instead, and playback lives under the existing `[id]`
  segment. No existing route changed shape.
- `GET /api/projects/[id]/playback` — signed playback URL
  (1-hour TTL) after the server-side check in `lib/playback.ts`:
  published + `video_status='ready'` + video path set +
  (signed in OR public browsing on). Response contains only
  the signed URL and TTL.
- **Existing behaviour preserved:** with neither `gallery` nor
  `slug` param, `GET /api/projects` still returns the exact
  Phase 2 dashboard view (own + group projects). `POST` and
  all `[id]` routes (GET/PATCH/DELETE, upload-url,
  complete-upload) are untouched.

### 4. Access — `lib/settings.ts`, `lib/playback.ts`
- **Settings reader (new):** there was NO settings reader in
  app code before Phase 3. `readPublicBrowsing()` reads
  `settings.public_browsing` via the service-role client,
  because migration 0002's RLS policy on `settings` is
  admin-only — a signed-in non-admin user client cannot read
  the table at all. The boolean is used server-side only; raw
  settings rows are never returned to a client.
- **Fail-closed default:** missing service key or a read error
  means public browsing is OFF (the seeded default). Visitors
  then get 401 and a "Sign in to browse" page; access never
  fails open to anonymous browsing.
- Signed-in gallery/detail reads go through the user client, so
  RLS (`can_view_project`) stays the real gate. Anonymous
  public-browsing reads go through the service-role client with
  an explicit `status='published'` filter (anon has no RLS
  policy at all, so an anon user-client query would return
  nothing).
- **Never exposed to the client:** service-role key, raw
  `video_path`, raw `thumbnail_path`, `owner_id`, caption
  `vtt_path`. Gallery/detail responses carry display names and
  signed thumbnail URLs only; playback is via signed URLs only.
- `lib/projects-server.ts`: added `prompts_notes` to
  `PROJECT_SELECT`/`ProjectRow` (needed for Behind the
  Scenes) and the `GalleryProject`/`CharacterRow`/`CaptionRow`
  shapes. No other server helper changed.

### 5. Style / navigation
- Existing §6.2 tokens and Tier 1 CSS only (skeleton shimmer,
  shared `.empty-state`, 150/300/600 ms timings). No Framer
  Motion, GSAP, tilt, parallax, marquee, or new dependencies.
  Reduced-motion handling is unchanged (global CSS rule).
- New CSS is limited to the filter grid, gallery-card link
  styling, duration badge, watch player, and section nav.
- Gallery links added to the navbar and footer next to the
  existing Upload/Dashboard links. Home page copy updated:
  hero badge Phase 3, gallery section links to `/explore`
  (placeholder cards removed), "not live yet" note now says
  gallery/playback are built locally, voting is Phase 4.

### 6. Pure helpers + tests
- `lib/gallery.ts` (pure): sort validation, `formatDuration`,
  search sanitization (ilike wildcards escaped), gallery param
  parsing, opaque cursor encode/decode, cursor-for-row.
- `scripts/test-gallery-rules.mjs` (7 tests) added to
  `npm test` alongside the existing email/video suites.

## Verification (all run locally, 2026-11-02)
- `npm test` — **45/45 pass** (email 20/20, video 18/18,
  gallery 7/7). No test was weakened or skipped.
- `npm run typecheck` — **exit 0** (one fix during the run:
  `Set` spread failed under this project's TS target, replaced
  with `Array.from` in the gallery route).
- `npm run build` — **exit 0**. Routes confirmed in the build
  output: `/explore` (static), `/watch/[slug]` (dynamic),
  `/api/projects/[id]/playback` (dynamic), all pre-existing
  routes still present.
- **Not created:** no `.env.local`, no secrets, no new
  dependency. **Not touched:** `middleware.ts`, `lib/email.ts`,
  the domain rule, migrations 0001–0004, the Portfolio project.

## Honest limits — what this build does NOT prove
1. **Real signed playback against live Storage is NOT proven
   by a local build.** The minting code follows the proven
   Phase 2 upload-URL pattern (service-role
   `createSignedUrl`), but no real published video, signed
   URL, or `<video>` playback has been exercised against the
   live bucket. That needs a published project on the deployed
   server plus a browser check.
2. **OTP sign-in is still unproven.** The gallery's
   members-only path depends on a signed-in session; until the
   pending OTP retest succeeds, the signed-in gallery/watch
   flow cannot be proven end to end either.
3. **Trending is interim.** Spec §4.2 defines trending as
   votes/views in the last 48 h, computed in a view — that
   needs the Phase 4 votes table, which does not exist yet.
   Phase 3 trending = most votes, newest first (same
   deterministic keyset as most_voted). It is labelled interim
   here and in code, not presented as the spec score.
4. **Duration is still client-supplied** (Phase 2 caveat,
   unchanged): the duration badge shows `duration_seconds`
   from complete-upload metadata, not a server-side parse.
5. **View counting is NOT implemented.** Watching a video does
   not increment `view_count` (spec's `POST /:id/view` is a
   Phase 4-adjacent item); counts shown are whatever the DB
   holds.
6. **Caption playback is NOT wired** (languages listed only),
   character images are NOT shown (Phase 2 stores a path
   string only, no image upload yet), and thumbnail URLs are
   absent when the server has no service key (cards then show
   a title initial, not a fake image).
7. **Facets cap:** facet distinct-values scan is limited to
   1000 published rows; the free-tier catalog (~50 videos at
   ~20 MB) is far below that, but a larger catalog would need
   a dedicated distinct-values query.
8. **Mobile renders not visually verified** (same honest limit
   as the UI/UX pass): CSS breakpoints were followed, but no
   375/768/1024 px screenshots were taken in this build.

## Next steps (need human go-ahead, NOT done here)
1. Review this report + the diff, then push to GitHub `main`
   (snapshot push procedure, as in Phases 0–2).
2. Vercel auto-deploy, then prove with a real published
   project: gallery lists it, watch plays it via signed URL,
   signed-out visitor is sent to `/login` while public
   browsing stays off.
3. OTP retest (still the blocking item from before Phase 3).
4. Phase 4 (voting + true trending + view counting) after
   Phase 3 is proven live.
