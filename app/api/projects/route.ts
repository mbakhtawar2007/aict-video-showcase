// Phase 2 — POST / GET /api/projects.
//
// POST creates a DRAFT owned by the signed-in user (status is
// never accepted from the client on create; publish happens via
// PATCH and is blocked unless video_status = 'ready', by both
// this route and the 0003 CHECK constraint). Group handling:
// group_id (existing group the user belongs to) or group_name
// (create a new group owned by the user, user added as member).
// Characters are inserted in the same request; a character
// failure rolls the project back via an explicit delete, because
// these routes have no multi-statement transaction helper.
// Under placeholder env: configured:false, 503 — never a fake
// success, following the Phase 1 pattern.
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { projectCreateSchema } from "@/lib/validation";
import { slugCandidates } from "@/lib/projects";
import {
  canEditProject,
  findFreeSlug,
  PROJECT_SELECT,
  type GalleryProject,
  type ProjectRow,
} from "@/lib/projects-server";
import {
  cursorForRow,
  parseGalleryParams,
} from "@/lib/gallery";
import { readPublicBrowsing } from "@/lib/settings";
import { PLAYBACK_URL_TTL_SECONDS } from "@/lib/playback";
import { VIDEO_BUCKET } from "@/lib/video";

function notConfigured() {
  return NextResponse.json(
    { ok: false, configured: false, error: "Supabase is not configured yet." },
    { status: 503 },
  );
}

// ---- Phase 3 — gallery + slug detail (added without touching
// the dashboard GET below or POST) ----
//
// DETAIL-ROUTE CHOICE (documented, per the Phase 3 brief): the
// spec §9 names GET /api/projects/:slug, but this app already
// has /api/projects/[id] (id = uuid). Adding a [slug] segment
// alongside [id] would make the two routes ambiguous (a slug
// could match the [id] segment). So detail is served as
// GET /api/projects?slug=<slug> instead, and playback as
// GET /api/projects/[id]/playback (under the existing [id]
// segment, no new segment). No existing route changes shape.
//
// GALLERY ACCESS: published rows only. Signed-in users go
// through their user client (RLS can_view_project is the real
// gate). Visitors go through the service-role client ONLY when
// settings.public_browsing is true (read server-side via
// lib/settings.ts); otherwise visitors get 401. There was no
// settings reader in app code before Phase 3 — this is it, and
// it fails closed (missing service key or read error = OFF).

const GALLERY_SELECT =
  "id, slug, title, tagline, genre, tools_used, duration_seconds, vote_count, view_count, created_at, group_id, owner_id, thumbnail_path";

type GalleryRow = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  genre: string | null;
  tools_used: string[];
  duration_seconds: number | null;
  vote_count: number;
  view_count: number;
  created_at: string;
  group_id: string | null;
  owner_id: string;
  thumbnail_path: string | null;
};

async function lookupNames(
  client: SupabaseClient,
  rows: GalleryRow[],
): Promise<{
  groups: Map<string, string>;
  creators: Map<string, string | null>;
}> {
  const groups = new Map<string, string>();
  const creators = new Map<string, string | null>();
  const groupIds = Array.from(new Set(rows.map((r) => r.group_id).filter(Boolean))) as string[];
  if (groupIds.length > 0) {
    const { data } = await client.from("groups").select("id, name").in("id", groupIds);
    for (const g of (data ?? []) as { id: string; name: string }[]) {
      groups.set(g.id, g.name);
    }
  }
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)));
  if (ownerIds.length > 0) {
    const { data } = await client
      .from("profiles")
      .select("id, username, full_name")
      .in("id", ownerIds);
    for (const p of (data ?? []) as {
      id: string;
      username: string | null;
      full_name: string | null;
    }[]) {
      creators.set(p.id, (p.full_name ?? "").trim() || p.username || null);
    }
  }
  return { groups, creators };
}

async function thumbnailUrls(
  admin: SupabaseClient | null,
  rows: GalleryRow[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!admin) return out;
  for (const row of rows) {
    if (!row.thumbnail_path) continue;
    const { data } = await admin.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(row.thumbnail_path, PLAYBACK_URL_TTL_SECONDS);
    if (data?.signedUrl) out.set(row.id, data.signedUrl);
  }
  return out;
}

async function toGalleryProjects(
  client: SupabaseClient,
  admin: SupabaseClient | null,
  rows: GalleryRow[],
): Promise<GalleryProject[]> {
  const { groups, creators } = await lookupNames(client, rows);
  const thumbs = await thumbnailUrls(admin, rows);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    tagline: r.tagline,
    genre: r.genre,
    tools_used: r.tools_used ?? [],
    duration_seconds: r.duration_seconds,
    vote_count: r.vote_count,
    view_count: r.view_count,
    created_at: r.created_at,
    group_id: r.group_id,
    group_name: r.group_id ? (groups.get(r.group_id) ?? null) : null,
    creator_name: creators.get(r.owner_id) ?? null,
    thumbnail_url: thumbs.get(r.id) ?? null,
  }));
}

async function galleryResponse(
  client: SupabaseClient,
  admin: SupabaseClient | null,
  search: URLSearchParams,
) {
  const publicBrowsing = await readPublicBrowsing(admin);
  const p = parseGalleryParams(search);
  if (p.cursorInvalid) {
    return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
  }
  // Base: published only, always — the gallery never lists
  // drafts or hidden projects, for any viewer.
  let query = client
    .from("projects")
    .select(GALLERY_SELECT)
    .eq("status", "published");
  if (p.genre) query = query.eq("genre", p.genre);
  if (p.tool) query = query.contains("tools_used", [p.tool]);
  if (p.group) query = query.eq("group_id", p.group);
  if (p.query) {
    // Search across title, creator name, and character name.
    // Character + creator matches resolve to project/owner id
    // sets first; the project query then ORs those with title.
    const pattern = `%${p.query}%`;
    const { data: charRows } = await client
      .from("characters")
      .select("project_id")
      .ilike("name", pattern);
const charProjectIds = Array.from(new Set((charRows ?? []).map((c) => (c as { project_id: string }).project_id)));
    const { data: profileRows } = await client
      .from("profiles")
      .select("id")
      .or(`username.ilike.${pattern},full_name.ilike.${pattern}`);
    const ownerIds = (profileRows ?? []).map((r) => (r as { id: string }).id);
    const ors = [`title.ilike.${pattern}`];
    if (ownerIds.length > 0) ors.push(`owner_id.in.(${ownerIds.join(",")})`);
    if (charProjectIds.length > 0) ors.push(`id.in.(${charProjectIds.join(",")})`);
    query = query.or(ors.join(","));
  }
  // Deterministic keyset order per sort (primary, created_at, id,
  // all descending) so the cursor filter below is exact.
  if (p.sort === "newest") {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (p.cursor && p.cursor.sort === "newest") {
      query = query.or(
        `created_at.lt.${p.cursor.created_at},and(created_at.eq.${p.cursor.created_at},id.lt.${p.cursor.id})`,
      );
    }
  } else if (p.sort === "most_viewed") {
    query = query
      .order("view_count", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (p.cursor && p.cursor.sort === "most_viewed") {
      query = query.or(
        `view_count.lt.${p.cursor.view_count},and(view_count.eq.${p.cursor.view_count},created_at.lt.${p.cursor.created_at}),and(view_count.eq.${p.cursor.view_count},created_at.eq.${p.cursor.created_at},id.lt.${p.cursor.id})`,
      );
    }
  } else {
    // most_voted and trending (interim: most votes, newest
    // first — see lib/gallery.ts; true 48h trending needs the
    // Phase 4 votes table).
    query = query
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (p.cursor && (p.cursor.sort === "most_voted" || p.cursor.sort === "trending")) {
      query = query.or(
        `vote_count.lt.${p.cursor.vote_count},and(vote_count.eq.${p.cursor.vote_count},created_at.lt.${p.cursor.created_at}),and(vote_count.eq.${p.cursor.vote_count},created_at.eq.${p.cursor.created_at},id.lt.${p.cursor.id})`,
      );
    }
  }
  const { data, error } = await query.range(0, p.limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const rows = ((data ?? []) as GalleryRow[]).slice(0, p.limit);
  const hasMore = (data ?? []).length > p.limit;
  const nextCursor =
    hasMore && rows.length > 0
      ? cursorForRow(p.sort, rows[rows.length - 1])
      : null;
  const projects = await toGalleryProjects(client, admin, rows);

  // Facets + featured strip only on the first page: they describe
  // the whole published catalog, not one page of it.
  let facets: { genres: string[]; tools: string[]; groups: { id: string; name: string }[] } | null = null;
  let featured: GalleryProject | null = null;
  if (!p.cursor) {
    const { data: facetRows } = await client
      .from("projects")
      .select("genre, tools_used, group_id")
      .eq("status", "published")
      .limit(1000);
    const genres = new Set<string>();
    const tools = new Set<string>();
    const facetGroupIds = new Set<string>();
    for (const r of (facetRows ?? []) as {
      genre: string | null;
      tools_used: string[];
      group_id: string | null;
    }[]) {
      if (r.genre) genres.add(r.genre);
      for (const t of r.tools_used ?? []) tools.add(t);
      if (r.group_id) facetGroupIds.add(r.group_id);
    }
    let facetGroups: { id: string; name: string }[] = [];
    if (facetGroupIds.size > 0) {
      const { data: g } = await client
        .from("groups")
        .select("id, name")
        .in("id", Array.from(facetGroupIds));
      facetGroups = ((g ?? []) as { id: string; name: string }[]).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    }
    facets = {
      genres: Array.from(genres).sort((a, b) => a.localeCompare(b)),
      tools: Array.from(tools).sort((a, b) => a.localeCompare(b)),
      groups: facetGroups,
    };
    // Featured = current leader (highest votes) ONLY when real
    // data exists (vote_count > 0). There is no teacher-picks
    // field in the schema, so no teacher-picks strip is faked.
    if (!p.query && !p.genre && !p.tool && !p.group) {
      const { data: leaderRows } = await client
        .from("projects")
        .select(GALLERY_SELECT)
        .eq("status", "published")
        .gt("vote_count", 0)
        .order("vote_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const leader = (leaderRows ?? []) as GalleryRow[];
      if (leader.length > 0) {
        featured = (await toGalleryProjects(client, admin, leader))[0] ?? null;
      }
    }
  }
  return NextResponse.json({
    ok: true,
    publicBrowsing,
    projects,
    nextCursor,
    facets,
    featured,
  });
}

async function slugDetailResponse(
  client: SupabaseClient,
  userId: string | null,
  admin: SupabaseClient | null,
  slugRaw: string,
) {
  const slug = slugRaw.trim().slice(0, 200);
  if (!slug) {
    return NextResponse.json({ error: "Missing project slug." }, { status: 400 });
  }
  const { data } = await client
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("slug", slug)
    .single();
  const project = data as ProjectRow | null;
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  // Gallery detail is for published projects. An owner/member/
  // admin may also preview their own draft via this endpoint;
  // everyone else gets a 404 (no leak about the draft).
  if (project.status !== "published") {
    if (
      !userId ||
      !(await canEditProject(client, userId, {
        owner_id: project.owner_id,
        group_id: project.group_id,
      }))
    ) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
  }
  const { data: characters } = await client
    .from("characters")
    .select("id, name, role, description, sort_order")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true });
  const { data: captions } = await client
    .from("captions")
    .select("id, language, label")
    .eq("project_id", project.id)
    .order("language", { ascending: true });
  let groupName: string | null = null;
  if (project.group_id) {
    const { data: g } = await client
      .from("groups")
      .select("name")
      .eq("id", project.group_id)
      .single();
    groupName = (g as { name?: string } | null)?.name ?? null;
  }
  const { data: owner } = await client
    .from("profiles")
    .select("username, full_name")
    .eq("id", project.owner_id)
    .single();
  const creatorName =
    ((owner as { full_name?: string | null; username?: string | null } | null)?.full_name ?? "").trim() ||
    (owner as { username?: string | null } | null)?.username ||
    null;
  let thumbnailUrl: string | null = null;
  if (admin && project.thumbnail_path) {
    const { data: signed } = await admin.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(project.thumbnail_path, PLAYBACK_URL_TTL_SECONDS);
    thumbnailUrl = signed?.signedUrl ?? null;
  }
  // Strip video_path (raw Storage path) and owner_id: the client
  // gets playback only via the signed URL from the playback
  // route / the watch page, never the path itself.
  const { video_path: _videoPath, owner_id: _ownerId, ...publicProject } = project;
  return NextResponse.json({
    ok: true,
    project: { ...publicProject, group_name: groupName, creator_name: creatorName, thumbnail_url: thumbnailUrl },
    characters: characters ?? [],
    captions: captions ?? [],
  });
}

export async function GET(request: NextRequest) {
  if (isPlaceholderSupabaseEnv()) return notConfigured();
  // Phase 3 dispatch: slug detail and gallery modes branch here;
  // with neither param, the original dashboard behaviour below
  // runs unchanged.
  const search = new URL(request.url).searchParams;
  const slugParam = search.get("slug");
  if (slugParam) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const admin = createAdminClient();
      if (!admin || !(await readPublicBrowsing(admin))) {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
      }
      return slugDetailResponse(admin, null, admin, slugParam);
    }
    return slugDetailResponse(supabase, user.id, createAdminClient(), slugParam);
  }
  if (search.get("gallery") === "true") {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const admin = createAdminClient();
      if (!admin || !(await readPublicBrowsing(admin))) {
        return NextResponse.json({ error: "Not signed in." }, { status: 401 });
      }
      return galleryResponse(admin, admin, search);
    }
    return galleryResponse(supabase, createAdminClient(), search);
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Dashboard view: own projects + projects of groups the user
  // belongs to. Published rows from others belong in the Phase 3
  // gallery, not "my projects", so RLS-visible published rows are
  // NOT included here. Two queries merged and deduplicated by id.
  const { data: own, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);
  const groupIds = (memberships ?? []).map((m) => (m as { group_id: string }).group_id);
  let groupProjects: unknown[] = [];
  if (groupIds.length > 0) {
    const { data: grouped } = await supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .in("group_id", groupIds)
      .order("updated_at", { ascending: false });
    groupProjects = grouped ?? [];
  }
  const seen = new Set<string>();
  const projects = [...(own ?? []), ...groupProjects].filter((p) => {
    const id = (p as { id: string }).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: NextRequest) {
  if (isPlaceholderSupabaseEnv()) return notConfigured();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid project data." },
      { status: 400 },
    );
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const input = parsed.data;

  // Resolve the group: existing group_id must belong to the user
  // (checked via membership, not trusted from the client).
  let groupId: string | null = null;
  if (input.group_id) {
    const { data: member } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", input.group_id)
      .eq("user_id", user.id)
      .single();
    if (!member) {
      return NextResponse.json(
        { error: "That group does not exist or you are not a member." },
        { status: 403 },
      );
    }
    groupId = input.group_id;
  } else if (input.group_name) {
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({ name: input.group_name, created_by: user.id })
      .select("id")
      .single();
    if (groupError || !group) {
      return NextResponse.json(
        { error: groupError?.message ?? "Could not create the group." },
        { status: 400 },
      );
    }
    groupId = (group as { id: string }).id;
    await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: user.id, role_in_group: "Creator" });
  }

  const slug = await findFreeSlug(supabase, slugCandidates(input.title));
  if (!slug) {
    return NextResponse.json(
      { error: "Could not find a free URL slug for this title. Change the title slightly." },
      { status: 409 },
    );
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      group_id: groupId,
      title: input.title,
      slug,
      tagline: input.tagline || null,
      description: input.description || null,
      concept: input.concept || null,
      story: input.story || null,
      genre: input.genre || null,
      tools_used: input.tools_used ?? [],
      status: "draft",
    })
    .select(PROJECT_SELECT)
    .single();
  if (error || !project) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create the project." },
      { status: 400 },
    );
  }
  const projectId = (project as { id: string }).id;

  if (input.characters && input.characters.length > 0) {
    const rows = input.characters.map((c, i) => ({
      project_id: projectId,
      name: c.name,
      role: c.role || null,
      description: c.description || null,
      image_path: c.image_path || null,
      sort_order: i,
    }));
    const { error: charError } = await supabase
      .from("characters")
      .insert(rows);
    if (charError) {
      // No transaction helper: roll back the project so a
      // half-created project never appears in the dashboard.
      await supabase.from("projects").delete().eq("id", projectId);
      return NextResponse.json(
        { error: charError.message },
        { status: 400 },
      );
    }
  }
  return NextResponse.json({ ok: true, project }, { status: 201 });
}
