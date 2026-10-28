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
import { createClient } from "@/lib/supabase/server";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { projectCreateSchema } from "@/lib/validation";
import { slugCandidates } from "@/lib/projects";
import { findFreeSlug, PROJECT_SELECT } from "@/lib/projects-server";

function notConfigured() {
  return NextResponse.json(
    { ok: false, configured: false, error: "Supabase is not configured yet." },
    { status: 503 },
  );
}

export async function GET() {
  if (isPlaceholderSupabaseEnv()) return notConfigured();
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
