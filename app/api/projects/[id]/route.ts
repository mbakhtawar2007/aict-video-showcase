// Phase 2 — GET / PATCH / DELETE /api/projects/[id].
//
// GET: owner/group member/admin, or any signed-in user for a
// published project (RLS via can_view_project is the real gate;
// the route re-checks so a hidden/draft row never leaks through
// an error message). PATCH: owner/group member only; publishing
// is blocked unless video_status = 'ready' (route check with a
// clear message, plus the 0003 CHECK constraint as backstop).
// rules_accepted_at is set by the client at review time and is
// REQUIRED to publish. DELETE: owner/group member only; when
// configured, the Storage video object is deleted via the
// service-role client after the row delete (best effort — a
// leftover object is swept by the nightly orphan job in the
// spec). Under placeholder env: configured:false, 503.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { projectUpdateSchema } from "@/lib/validation";
import {
  canEditProject,
  PROJECT_SELECT,
  type ProjectRow,
} from "@/lib/projects-server";

function notConfigured() {
  return NextResponse.json(
    { ok: false, configured: false, error: "Supabase is not configured yet." },
    { status: 503 },
  );
}

async function loadProject(supabase: ReturnType<typeof createClient>, id: string) {
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .single();
  return data as ProjectRow | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (isPlaceholderSupabaseEnv()) return notConfigured();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const project = await loadProject(supabase, params.id);
  // RLS already hides non-visible rows (single() returns null),
  // so a missing row is 404 regardless of the reason — no leak
  // about whether the id exists.
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, role, description, image_path, sort_order")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true });
  return NextResponse.json({ ok: true, project, characters: characters ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (isPlaceholderSupabaseEnv()) return notConfigured();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = projectUpdateSchema.safeParse(body);
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
  const project = await loadProject(supabase, params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (!(await canEditProject(supabase, user.id, project))) {
    return NextResponse.json(
      { error: "You cannot edit this project." },
      { status: 403 },
    );
  }
  const input = parsed.data;
  // Publish gate: video must be ready AND rules confirmed.
  if (input.status === "published") {
    if (project.video_status !== "ready") {
      return NextResponse.json(
        { error: "Publish is blocked until the video is ready. Upload an MP4 (H.264, ≤ 50 MB) and complete the upload first." },
        { status: 409 },
      );
    }
    const rulesAt = input.rules_accepted_at || project.rules_accepted_at;
    if (!rulesAt) {
      return NextResponse.json(
        { error: "Confirm the rules and rights checklist before publishing." },
        { status: 409 },
      );
    }
  }
  // Never accept vote/view counts or owner changes: strip them
  // even though the schema does not include them.
  const update: Record<string, unknown> = {};
  for (const key of [
    "title", "tagline", "description", "concept", "story", "genre",
    "tools_used", "group_id", "status", "rules_accepted_at",
  ] as const) {
    if (input[key] !== undefined) {
      update[key] =
        input[key] === "" ? null : input[key];
    }
  }
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
  }
  const { data: updated, error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", project.id)
    .select(PROJECT_SELECT)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Characters: replace the whole set when supplied.
  if (input.characters !== undefined) {
    await supabase.from("characters").delete().eq("project_id", project.id);
    if (input.characters.length > 0) {
      const rows = input.characters.map((c, i) => ({
        project_id: project.id,
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
        return NextResponse.json({ error: charError.message }, { status: 400 });
      }
    }
  }
  return NextResponse.json({ ok: true, project: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (isPlaceholderSupabaseEnv()) return notConfigured();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const project = await loadProject(supabase, params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (!(await canEditProject(supabase, user.id, project))) {
    return NextResponse.json(
      { error: "You cannot delete this project." },
      { status: 403 },
    );
  }
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", project.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Best-effort Storage cleanup (service role only). Characters
  // and captions cascade in the database; the video object does
  // not, so it is removed here when a service key exists.
  const admin = createAdminClient();
  if (admin && project.video_path) {
    await admin.storage.from("videos").remove([project.video_path]);
  }
  return NextResponse.json({ ok: true });
}
