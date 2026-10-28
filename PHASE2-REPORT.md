# AICT Phase 2 Report — built locally, on top of Phase 1 + UI pass

**Status: LOCAL ONLY. NOT pushed to GitHub, NOT deployed to
Netlify or Vercel, NO migration run against any live database,
NO real secret/key/teacher email used or invented.** GitHub head
is still the UI pass (`7d082e8`); nothing in this build was
pushed. `.env.example` is untouched (placeholders only) and no
`.env.local` exists. `next.config.mjs` is untouched.

## Scope (spec §4.1, §4.3, §5.2 — with the LOCKED free-video delta)

- **Domain rule unchanged:** `@duet.edu.pk` for both teachers
  and students, exact match, `allow_subdomains=false`. No
  Phase 2 file contains `students.duet.edu.pk` in any operative
  code (verified by grep; the only mentions in the repo are
  historical comments in Phase 0/1 files and the delta file's
  header, which the task states is superseded). No auth page
  logic, no domain rule, no Phase 1 route was changed.
- **Video path is the locked free delta, not Stream:** Supabase
  Storage private bucket `videos`, MP4 (H.264) only, ≤ 50 MB per
  file, 1 GB total, signed URLs, no transcoding. The spec's
  500 MB / 10-minute defaults do NOT apply. Rejection wording:
  "Export as H.264 MP4 and try again."
- **Upload flow follows the spec's wizard shape (§5.2)** —
  Details → Video → Characters → Review + rules confirmation —
  but with the delta's upload mechanics: browser checks, then a
  server-issued signed upload URL, then server re-validation
  before `ready`. There is no tus upload, no Stream webhook, no
  playback in Phase 2 (playback is Phase 3).

## Files added

- `supabase/migrations/0003_projects.sql` — `groups`,
  `group_members`, `projects` (with `video_path`, NOT
  `video_uid`; `video_status` none/uploading/processing/ready/
  failed default none; `video_size_bytes`, `duration_seconds`,
  `thumbnail_path`, `status` draft/published/hidden default
  draft, `rules_accepted_at`, `vote_count`, `view_count`,
  timestamps, `CHECK (status <> 'published' OR video_status =
  'ready')`), `characters` (project cascade, name/role/
  description/`image_path`/`sort_order`), `captions` (project
  cascade, language/label + `vtt_path` — see note below),
  `can_view_project` / `can_edit_project` / `is_group_member`
  security-definer helpers, RLS per §4.3 (published visible to
  signed-in browsers; owner/group members see own drafts; admin
  sees all; owner/group members insert/update/delete own and
  cannot publish unless ready; admin can hide any; characters/
  captions follow the parent project), column grants that
  exclude `vote_count`/`view_count`/`last_vote_at`/`owner_id`
  from client UPDATE, indexes `projects(status, created_at)`
  and `projects(vote_count DESC, last_vote_at ASC)` plus lookup
  indexes, and the private `videos` bucket insert.
  - `captions.vtt_path` is a Phase 2 ADDITION, not in spec
    §4.1: the spec's captions table has language + label only,
    but the delta says captions still use "uploaded VTT files",
    so the uploaded VTT's Storage path needs a column. It is
    nullable and holds e.g. `projects/<id>/captions/en.vtt`.
  - `processing` is kept as a status value for API
    compatibility; the free path never transcodes, so it goes
    `uploading` → `ready`/`failed` directly.
- `lib/video.ts` — pure validators: MIME (`video/mp4` only),
  extension, ≤ 50 MB cap, ftyp magic bytes (accepts isom/iso*/
  mp41/mp42/avc1/dash; rejects MOV `qt  `, HEVC hev1/hvc1,
  WebM EBML magic, renamed non-videos, unknown brands), ≤ 120 s
  duration cap, storage counter (warn at 80%, block at 100% of
  1 GB), `formatBytes`, `VIDEO_BUCKET = "videos"`.
- `lib/projects.ts` — pure slug helpers (`slugifyTitle`,
  `slugCandidates`, `videoObjectPath` =
  `projects/<id>/video.mp4`), status constants.
- `lib/projects-server.ts` — server-only helpers: project row
  type + select list, `canEditProject` (owner/group/admin),
  `findFreeSlug` (base, base-2, …).
- `lib/validation.ts` (extended) — Zod schemas for project
  create/update, character input, complete-upload. `role` /
  `status` vote counts etc. are never accepted from clients on
  create; `status` is accepted on PATCH only as
  draft/published/hidden.
- `app/api/projects/route.ts` — POST (draft, owner = signed-in
  user, slug + collision handling, group_id membership check or
  group_name creation, characters inserted, project rolled back
  if characters fail) and GET (own + group projects for the
  dashboard; published rows from others are NOT included — they
  belong in the Phase 3 gallery).
- `app/api/projects/[id]/route.ts` — GET (project + characters,
  404 without leaking existence), PATCH (owner/group only,
  publish blocked unless `video_status = 'ready'` AND rules
  confirmed, characters replaced when supplied), DELETE
  (owner/group only, best-effort Storage object delete via
  service role).
- `app/api/projects/[id]/upload-url/route.ts` — POST, returns
  a signed upload URL in the private `videos` bucket. Path is
  derived from the project id only; another project's path can
  never be requested. `configured:false` under placeholder env
  or without a service key.
- `app/api/projects/[id]/complete-upload/route.ts` — POST,
  validates size (Storage metadata size preferred over the
  client claim), MIME, magic bytes (first 24 bytes, base64,
  required — a missing header is a failure, not a pass), and
  duration, confirms the object exists in Storage, then sets
  `ready` (with path/size/duration) or `failed` with a reason.
  Never marks ready without a real file.
- `app/api/groups/route.ts` — GET, groups the user created or
  belongs to (supporting the wizard's group selection).
- `app/api/storage-usage/route.ts` — GET, used / 1 GB, warn
  flag at 80%, block flag at 100%; placeholder env returns
  `configured:false` WITH the caps documented, never a fake 0.
- `app/upload/page.tsx` — 4-step wizard (Details: title,
  tagline, description, concept, story, genre, tools_used,
  group selection/creation; Video: MP4 picker with client-side
  MIME/extension/size/magic/duration checks and ≤ 20 MB / ≤ 2
  min / 720p guidance; Characters: add/edit/remove, image_path
  field only, no image upload; Review: live preview of entered
  details + rules checkbox). Real upload flow after draft
  save: upload-url → PUT to signed URL → complete-upload.
  Edit mode via `/upload?id=<id>`. No video playback anywhere
  in the wizard (Phase 3); duration is read from metadata via
  an off-screen element only.
- `app/dashboard/page.tsx` — stats (my projects, drafts,
  published, my total video size), project list with status
  badges, Edit/Delete actions, storage-usage bar with
  warn/block states.
- `scripts/test-video-rules.mjs` — 18 tests for the video
  validators and slug helpers (see Verification).

## Files changed (no redesign, no auth change)

- `app/layout.tsx` — nav gains Upload + Dashboard links;
  footer note and metadata now say Phase 2 (upload/dashboard),
  gallery/playback/voting still later phases.
- `app/globals.css` — appended Phase 2 classes only (stepper,
  badges, storage bar, project list) on the existing tokens.
  No token, auth style, or layout change.
- `package.json` — `test` script now runs both test files.
  No new dependencies were added.
- `README.md` — Phase 2 scope section added (see below).

## Verification (actually run, 2026-10-28, local only)

- `npm test`: **32/32 pass** — 14 existing email-rule tests +
  18 new video tests (good MP4 isom/mp42 headers, renamed
  PNG/text rejection, MOV/HEVC/WebM rejection with the locked
  message, unknown-brand rejection, MIME/extension/size
  boundaries incl. 50 MB + 1 byte, duration 120 s pass / 121 s
  fail / unknown fail, storage warn-at-80% / block-at-100%
  boundaries, slug candidates, video object path).
- `npm run typecheck`: **exit 0** (two errors found and fixed
  during the run: `videoObjectPath` imported from the wrong
  module, and a nullable project row inside a closure).
- `npm run build`: **exit 0**. Routes in the output:
  `/upload` (5.19 kB), `/dashboard` (2.59 kB),
  `/api/projects`, `/api/projects/[id]`,
  `/api/projects/[id]/upload-url`,
  `/api/projects/[id]/complete-upload`, `/api/groups`,
  `/api/storage-usage`, plus all Phase 1 routes unchanged.
- Live placeholder-env check against the built server
  (`next start`, no `.env.local`): GET `/api/projects`,
  GET `/api/groups`, GET `/api/storage-usage` and POST
  `/api/projects` all returned **503 `configured:false`**;
  GET `/api/health` returned 200. No route pretends a live
  upload or save succeeded.
- Secret scan: no real keys in new/changed files (no `sk-`,
  `ghp_`, JWT, AWS key, or private-key material); `.env.local`
  does not exist; `.env.example` unchanged (placeholders only).
- Domain grep: no `students.duet.edu.pk` in any Phase 2 file.
- No `npm install` was needed (no new dependencies).

## Honest limits — what Phase 2 does NOT prove

- **No live Supabase project, no migration executed.**
  0003 has NOT been run anywhere; RLS, the CHECK constraint,
  the security-definer helpers, and the bucket insert are
  untested against live Postgres. The group_members read policy
  uses a security-definer helper specifically to avoid a
  self-referential policy lookup — that choice still needs a
  live run to confirm.
- **No real Storage upload tested.** Signed upload URLs,
  the Storage object-existence check, and the Storage-side
  size metadata are written but unexercised; the upload-url
  and complete-upload routes additionally require a service
  key that does not exist yet.
- **Duration is NOT server-proven.** The client reads duration
  from file metadata and complete-upload re-checks the claimed
  value against the cap, but a client could lie about it. A
  server-side duration parse (ffprobe / mp4box-style) must be
  added before the 2-minute cap can be called enforced.
  `duration_note` in the complete-upload response says this.
- **Storage-usage counter is DB-derived** (sum of
  `projects.video_size_bytes`), so orphaned objects are NOT
  counted. The live admin panel must reconcile against the
  Storage API before treating "not full" as proof, and the
  100% publish block is a flag here — the publish flow in
  Phase 3 / admin work must check it before allowing a
  publish, since Phase 2's PATCH publish gate checks
  `ready` + rules only.
- **No live sign-in test.** `/upload` and `/dashboard`
  redirect to `/login` on 401 (Phase 1 pattern); under
  placeholder env they show a "not configured" banner and let
  the steps be previewed, because a 503 is not a signed-out
  user. The wizard's save/publish buttons therefore fail with
  `configured:false` until Supabase is live — that is the
  honest behaviour, not a bug.
- **Not covered in Phase 2:** gallery, watch/playback page,
  voting, leaderboard, comments, admin panel, thumbnail or
  character image upload, VTT upload (only the `vtt_path`
  column exists), nightly orphan sweep, Upstash rate limits.
- **No push, no deploy.** `next.config.mjs` untouched; no
  static-export staging was needed because `next build`
  itself passed (the task allowed staging only if testing it,
  and it was not needed).
- The 80% storage boundary is not a whole byte (80% of 1 GB
  = 858993459.2 bytes); the code warns from the first byte at
  or above 80% (858993460) and the test pins both sides of
  that boundary.
