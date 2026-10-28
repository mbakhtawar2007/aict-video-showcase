// Phase 2 — POST /api/projects/[id]/complete-upload.
//
// Validates the uploaded file and sets video_status to 'ready'
// or 'failed'. NEVER marks ready without a real file: the route
// requires a service-role client, confirms the object exists in
// the private 'videos' bucket, and re-checks size, MIME and
// magic bytes from the supplied metadata + header bytes. A
// failure sets video_status='failed' (with the reason returned)
// so the wizard can show a retry, and the object is left for the
// user to overwrite on retry (upsert) or for the orphan sweep.
// Duration comes from client metadata (see lib/video.ts caveat):
// it is checked against the 2-minute cap here, but it is NOT
// server-proven until a server-side duration parse is added —
// that gap is documented, not hidden.
// Under placeholder env: configured:false, 503, never ready.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { completeUploadSchema } from "@/lib/validation";
import { canEditProject } from "@/lib/projects-server";
import {
  validateVideoMime,
  validateVideoSize,
  validateVideoMagicBytes,
  validateVideoDuration,
  VIDEO_BUCKET,
  EXPORT_AS_MP4_MESSAGE,
} from "@/lib/video";
import { videoObjectPath } from "@/lib/projects";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  if (isPlaceholderSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Supabase is not configured yet." },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = completeUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid upload data." },
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
      { error: "You cannot complete an upload for this project." },
      { status: 403 },
    );
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Upload verification is not configured on the server yet (service key missing).",
      },
      { status: 503 },
    );
  }
  // Copy the id into a plain const: TS resets narrowing of the
  // nullable query row inside the markFailed closure otherwise.
  const projectId = project.id;
  const path = videoObjectPath(projectId);
  const input = parsed.data;

  async function markFailed(reason: string) {
    await supabase
      .from("projects")
      .update({ video_status: "failed" })
      .eq("id", projectId);
    return NextResponse.json({ ok: false, error: reason }, { status: 400 });
  }

  // 1. The object must really exist in Storage.
  const { data: objects } = await admin.storage
    .from(VIDEO_BUCKET)
    .list(`projects/${projectId}`, { search: "video.mp4" });
  const stored = (objects ?? []).find((o) => o.name === "video.mp4");
  if (!stored) {
    return markFailed("No uploaded video was found for this project. Upload again.");
  }
  // 2. Size: prefer the Storage metadata size (truth) over the
  // client claim when it is present.
  const storedSize = (stored.metadata as { size?: number } | null)?.size;
  const sizeBytes =
    typeof storedSize === "number" && storedSize > 0
      ? storedSize
      : input.size_bytes;
  const sizeCheck = validateVideoSize(sizeBytes);
  if (!sizeCheck.ok) return markFailed(sizeCheck.error);
  // 3. MIME (client-supplied; the magic check below is the
  // backstop for a renamed file).
  const mimeCheck = validateVideoMime(input.mime);
  if (!mimeCheck.ok) return markFailed(mimeCheck.error);
  // 4. Magic bytes from the supplied file header.
  let headerBytes: Uint8Array;
  try {
    headerBytes = Uint8Array.from(Buffer.from(input.header_base64, "base64"));
  } catch {
    return markFailed("Could not read the file header. " + EXPORT_AS_MP4_MESSAGE);
  }
  const magicCheck = validateVideoMagicBytes(headerBytes);
  if (!magicCheck.ok) return markFailed(magicCheck.error);
  // 5. Duration (client metadata; see the caveat in lib/video.ts).
  const durationCheck = validateVideoDuration(
    input.duration_seconds ?? null,
  );
  if (!durationCheck.ok) return markFailed(durationCheck.error);

  const { error } = await supabase
    .from("projects")
    .update({
      video_status: "ready",
      video_path: path,
      video_size_bytes: sizeBytes,
      duration_seconds: Math.round(input.duration_seconds as number),
    })
    .eq("id", projectId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    video_status: "ready",
    video_path: path,
    video_size_bytes: sizeBytes,
    duration_seconds: Math.round(input.duration_seconds as number),
    duration_note:
      "Duration was supplied by the client and re-checked against the cap only; server-side duration parsing is still to be added (see lib/video.ts).",
  });
}
