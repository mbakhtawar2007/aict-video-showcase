-- AICT Phase 2 — groups, projects, characters, captions (Spec v1.1
-- §4.1, §4.2, §4.3), adapted for the LOCKED free-video delta.
--
-- DO NOT RUN YET:
--  * The new AICT Supabase project has NOT been created.
--  * NEVER run this against GreenKarachi or any other existing project.
--  * This migration is LOCAL ONLY until a human creates the AICT
--    project and runs 0001, then 0002, then 0003 against it. RLS
--    has NOT been tested against live Postgres.
--
-- FREE-VIDEO ADAPTATIONS (delta supersedes the Stream parts only):
--  * projects.video_uid (Stream ID) does NOT exist here. The column
--    is projects.video_path (Storage object path, e.g.
--    'projects/<project_id>/video.mp4') in the private 'videos'
--    bucket. Do not add video_uid; the upgrade path (Mux) would
--    need it again, but v1 must not build both paths.
--  * video_status meanings: 'none' (no file yet), 'uploading',
--    'processing' (kept for API compatibility; the free path sets
--    'ready' directly after validation, it never transcodes),
--    'ready' (file present + MIME/magic validated MP4/H.264 +
--    size/duration within caps), 'failed'.
--  * duration_seconds is set by the complete-upload route from
--    client-supplied metadata AFTER the file passed MIME/magic/
--    size checks. It is NOT server-proven until a server-side
--    duration parse is added (see lib/video.ts DURATION CAVEAT).
--  * captions.vtt_path is a Phase 2 ADDITION, not in spec §4.1:
--    the spec's captions table has language + label only, but the
--    delta says captions still use "uploaded VTT files", so the
--    uploaded VTT's Storage path needs a column. It is nullable
--    and holds a path like 'projects/<id>/captions/en.vtt'.
--
-- DOMAIN NOTE: nothing in this migration mentions any email
-- domain. The current domain rule (@duet.edu.pk for both teachers
-- and students, exact match, allow_subdomains=false) lives in
-- 0001/0002 and lib/email.ts and is untouched here.

-- 1. Groups and membership (spec §4.1).
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role_in_group text, -- e.g. Director, Prompt Engineer, Editor
  primary key (group_id, user_id)
);

-- 2. Projects (spec §4.1, video_path instead of video_uid).
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  group_id uuid references public.groups on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  slug text unique not null,
  tagline text,
  description text,
  concept text,
  story text, -- markdown, sanitized on render (Phase 3)
  genre text,
  tools_used text[] not null default '{}',
  prompts_notes text, -- optional behind-the-scenes
  video_path text, -- Storage path in private bucket 'videos', null until upload starts
  video_status text not null default 'none'
    check (video_status in ('none', 'uploading', 'processing', 'ready', 'failed')),
  video_size_bytes bigint check (video_size_bytes is null or video_size_bytes >= 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  thumbnail_path text, -- custom image path; no Stream frame on this path
  status text not null default 'draft'
    check (status in ('draft', 'published', 'hidden')),
  rules_accepted_at timestamptz, -- publish-time rules/rights confirmation
  vote_count int not null default 0,
  last_vote_at timestamptz,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Spec §4.2: publish requires ready, enforced in the database,
  -- not only in the UI or the API route.
  constraint projects_published_requires_ready
    check (status <> 'published' or video_status = 'ready')
);

-- 3. Characters and captions (spec §4.1, + vtt_path, see header).
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  role text,
  description text,
  image_path text, -- Phase 2: path string only, no image upload yet
  sort_order int not null default 0
);

create table if not exists public.captions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  language text not null, -- BCP-47, e.g. 'en'
  label text not null,
  vtt_path text, -- Phase 2 addition, see header note
  unique (project_id, language)
);

-- 4. updated_at maintenance.
create or replace function public.set_project_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_project_updated_at();

-- 5. Access helpers (SECURITY DEFINER so policies can share one
-- definition without recursive policy lookups on group_members).
-- can_view_project: published is visible to any signed-in user
-- (public browsing is OFF, so no anon policy); owner and group
-- members see their own drafts; admin sees all.
create or replace function public.can_view_project(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_id
      and (
        p.status = 'published'
        or p.owner_id = auth.uid()
        or public.is_admin()
        or exists (
          select 1 from public.group_members m
          where m.group_id = p.group_id and m.user_id = auth.uid()
        )
      )
  );
$$;

-- is_group_member: SECURITY DEFINER helper so policies can test
-- membership without a self-referential policy lookup on
-- group_members (a policy that queries its own table can recurse).
create or replace function public.is_group_member(g_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = g_id and m.user_id = auth.uid()
  );
$$;

-- can_edit_project: owner or group member (active users only;
-- the write policies also require is_active(), so a suspended
-- member is read-only even though this helper alone would pass).
create or replace function public.can_edit_project(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_id
      and (
        p.owner_id = auth.uid()
        or public.is_admin()
        or exists (
          select 1 from public.group_members m
          where m.group_id = p.group_id and m.user_id = auth.uid()
        )
      )
  );
$$;

-- 6. RLS.
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.projects enable row level security;
alter table public.characters enable row level security;
alter table public.captions enable row level security;

-- Groups: any signed-in user can read groups (needed to select a
-- group in the upload wizard); only the creator or an admin can
-- update/delete; any active signed-in user can create one.
drop policy if exists groups_read_signed_in on public.groups;
create policy groups_read_signed_in on public.groups
  for select to authenticated using (true);

drop policy if exists groups_insert_active on public.groups;
create policy groups_insert_active on public.groups
  for insert to authenticated
  with check (public.is_active() and created_by = auth.uid());

drop policy if exists groups_update_creator_admin on public.groups;
create policy groups_update_creator_admin on public.groups
  for update to authenticated
  using (public.is_active() and (created_by = auth.uid() or public.is_admin()))
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists groups_delete_creator_admin on public.groups;
create policy groups_delete_creator_admin on public.groups
  for delete to authenticated
  using (public.is_active() and (created_by = auth.uid() or public.is_admin()));

-- Group members: members see their own group's roster; the group
-- creator or an admin manages membership. (Creator check uses a
-- direct lookup, not a policy on groups, to avoid recursion.)
drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.is_group_member(group_id)
  );

drop policy if exists group_members_manage on public.group_members;
create policy group_members_manage on public.group_members
  for all to authenticated
  using (
    public.is_active()
    and (
      public.is_admin()
      or exists (
        select 1 from public.groups g
        where g.id = group_members.group_id and g.created_by = auth.uid()
      )
    )
  )
  with check (
    public.is_active()
    and (
      public.is_admin()
      or exists (
        select 1 from public.groups g
        where g.id = group_members.group_id and g.created_by = auth.uid()
      )
    )
  );

-- Projects: read per spec §4.3 via can_view_project; write only
-- for active owner/group members, admin can hide any (hide is an
-- update to status='hidden', allowed by the update policy below;
-- the CHECK constraint still blocks publishing without ready).
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select to authenticated
  using (public.can_view_project(id));

drop policy if exists projects_insert_owner on public.projects;
create policy projects_insert_owner on public.projects
  for insert to authenticated
  with check (public.is_active() and owner_id = auth.uid());

drop policy if exists projects_update_editor on public.projects;
create policy projects_update_editor on public.projects
  for update to authenticated
  using (public.is_active() and public.can_edit_project(id))
  with check (public.is_active() and public.can_edit_project(id));

drop policy if exists projects_delete_editor on public.projects;
create policy projects_delete_editor on public.projects
  for delete to authenticated
  using (public.is_active() and public.can_edit_project(id));

-- Characters / captions follow the parent project (spec §4.3).
drop policy if exists characters_read on public.characters;
create policy characters_read on public.characters
  for select to authenticated
  using (public.can_view_project(project_id));

drop policy if exists characters_write on public.characters;
create policy characters_write on public.characters
  for all to authenticated
  using (public.is_active() and public.can_edit_project(project_id))
  with check (public.is_active() and public.can_edit_project(project_id));

drop policy if exists captions_read on public.captions;
create policy captions_read on public.captions
  for select to authenticated
  using (public.can_view_project(project_id));

drop policy if exists captions_write on public.captions;
create policy captions_write on public.captions
  for all to authenticated
  using (public.is_active() and public.can_edit_project(project_id))
  with check (public.is_active() and public.can_edit_project(project_id));

-- 7. Grants. Anon gets nothing (public browsing OFF). Authenticated
-- gets table access gated by the policies above. UPDATE on
-- projects deliberately EXCLUDES vote_count, view_count,
-- last_vote_at and owner_id: counts are maintained by triggers /
-- server functions in later phases, and ownership never changes
-- via a client update. status IS in the grant because draft ->
-- published is a client action — but the CHECK constraint blocks
-- publishing unless video_status = 'ready', and the API route
-- blocks it again with a clearer error.
revoke all on public.groups from authenticated, anon;
revoke all on public.group_members from authenticated, anon;
revoke all on public.projects from authenticated, anon;
revoke all on public.characters from authenticated, anon;
revoke all on public.captions from authenticated, anon;

grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, delete on public.projects to authenticated;
grant update (
  group_id, title, slug, tagline, description, concept, story, genre,
  tools_used, prompts_notes, video_path, video_status,
  video_size_bytes, duration_seconds, thumbnail_path, status,
  rules_accepted_at
) on public.projects to authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select, insert, update, delete on public.captions to authenticated;

-- 8. Indexes (spec §4.2, plus lookup indexes for the wizard/API).
create index if not exists projects_status_created_idx
  on public.projects (status, created_at);
create index if not exists projects_vote_leaderboard_idx
  on public.projects (vote_count desc, last_vote_at asc);
create index if not exists projects_owner_idx
  on public.projects (owner_id);
create index if not exists projects_group_idx
  on public.projects (group_id);
create index if not exists characters_project_sort_idx
  on public.characters (project_id, sort_order);
create index if not exists captions_project_idx
  on public.captions (project_id);
create index if not exists group_members_user_idx
  on public.group_members (user_id);

-- 9. Private 'videos' Storage bucket (free-video delta).
-- No public access; no client object policy is granted here on
-- purpose. Uploads go through server-issued signed upload URLs
-- (service role, after the API route's access check), and the
-- server deletes objects on project delete. Object-level Storage
-- policies must be verified against the live bucket in Phase 3
-- (see PHASE2-REPORT.md) — this insert alone does not prove the
-- upload flow works.
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;
