// Phase 2 — POST /api/projects/[id]/upload-url.
//
// Returns a server-issued signed upload URL for the private
// 'videos' bucket (free-video delta: no tus, no Stream). The path
// is derived from the project id ONLY — a caller can never ask
// for another project's path, and the route 404s/403s before any
// URL is minted for a project the user cannot edit.
// Under placeholder env: configured:false, 503 — never a fake
// URL. When Supabase is configured but no service-role key is
// set, uploads cannot be issued either (signed URLs are minted
// server-side), and the route says so instead of succeeding.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { canEditProject } from "@/lib/projects-server";
import { videoObjectPath } from "@/lib/projects";
import { VIDEO_BUCKET } from "@/lib/video";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (isPlaceholderSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Supabase is not configured yet." },
      { status: 503 },
    );
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, group_id, video_status")
    .eq("id", params.id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (
    !(await canEditProject(supabase, user.id, project as {
      owner_id: string;
      group_id: string | null;
    }))
  ) {
    return NextResponse.json(
      { error: "You cannot upload to this project." },
      { status: 403 },
    );
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Video upload is not configured on the server yet (service key missing).",
      },
      { status: 503 },
    );
  }
  const path = videoObjectPath(project.id);
  const { data: signed, error } = await admin.storage
    .from(VIDEO_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !signed) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create an upload URL." },
      { status: 400 },
    );
  }
  // Mark the project as uploading so the dashboard reflects it.
  // A failed upload leaves it here until complete-upload sets
  // ready/failed, or the user retries.
  await supabase
    .from("projects")
    .update({ video_status: "uploading" })
    .eq("id", project.id);
  return NextResponse.json({
    ok: true,
    bucket: VIDEO_BUCKET,
    path,
    signedUrl: signed.signedUrl,
    token: signed.token,
  });
}
