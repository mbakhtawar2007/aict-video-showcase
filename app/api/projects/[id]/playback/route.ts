// Phase 3 — GET /api/projects/[id]/playback.
//
// Issues a short-lived signed URL for progressive MP4 playback
// from the private 'videos' bucket, AFTER the server-side access
// check in lib/playback.ts: published + video_status='ready' +
// (signed in OR public browsing on). The response contains only
// the signed URL and its TTL — never the service-role key and
// never the raw video_path. RLS (can_view_project) is still the
// real gate for the user-client project read; for anonymous
// public-browsing visitors the project is read via the
// service-role client with an explicit status='published'
// filter, since anon has no RLS policy at all.
// Under placeholder env: configured:false, 503 — never a fake URL.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { readPublicBrowsing } from "@/lib/settings";
import { mintPlaybackUrl, type PlaybackProject } from "@/lib/playback";

export async function GET(
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
  const admin = createAdminClient();
  const publicBrowsing = await readPublicBrowsing(admin);
  let project: PlaybackProject | null = null;
  if (user) {
    const { data } = await supabase
      .from("projects")
      .select("id, status, video_status, video_path")
      .eq("id", params.id)
      .single();
    project = data as PlaybackProject | null;
  } else if (publicBrowsing && admin) {
    const { data } = await admin
      .from("projects")
      .select("id, status, video_status, video_path")
      .eq("id", params.id)
      .eq("status", "published")
      .single();
    project = data as PlaybackProject | null;
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const result = await mintPlaybackUrl(admin, project, !!user, publicBrowsing);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    signedUrl: result.signedUrl,
    expiresIn: result.expiresIn,
  });
}
