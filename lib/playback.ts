// AICT Phase 3 — server-only signed playback.
//
// NEVER import from a client component. The service-role client
// mints the URL; the browser only ever receives the signed URL
// itself, never the service-role key and never the raw
// video_path (the gallery/detail APIs strip video_path from
// their responses for the same reason).
//
// Access rule, checked before ANY URL is minted:
//   project.status === 'published'
//   AND project.video_status === 'ready'
//   AND project.video_path is set
//   AND (a signed-in user exists OR public browsing is enabled)
// RLS (can_view_project) is still the real gate for user-client
// reads; this helper is the route-level check that produces
// clear 401/403/404/503 responses instead of leaking denials.
// For anonymous public-browsing reads the caller must use the
// service-role client for the project lookup (anon has no RLS
// policy at all) and must itself enforce status='published'.
import type { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_BUCKET } from "@/lib/video";

export const PLAYBACK_URL_TTL_SECONDS = 3600; // 1 hour, short-lived

export type PlaybackProject = {
  id: string;
  status: string;
  video_status: string;
  video_path: string | null;
};

export type PlaybackResult =
  | { ok: true; signedUrl: string; expiresIn: number }
  | { ok: false; status: number; error: string };

export async function mintPlaybackUrl(
  admin: SupabaseClient | null,
  project: PlaybackProject,
  signedIn: boolean,
  publicBrowsing: boolean,
): Promise<PlaybackResult> {
  if (!signedIn && !publicBrowsing) {
    return { ok: false, status: 401, error: "Not signed in." };
  }
  if (project.status !== "published") {
    return { ok: false, status: 404, error: "Project not found." };
  }
  if (project.video_status !== "ready" || !project.video_path) {
    return {
      ok: false,
      status: 409,
      error: "This video is not ready to play yet.",
    };
  }
  if (!admin) {
    return {
      ok: false,
      status: 503,
      error: "Video playback is not configured on the server yet (service key missing).",
    };
  }
  const { data, error } = await admin.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(project.video_path, PLAYBACK_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return {
      ok: false,
      status: 400,
      error: error?.message ?? "Could not create a playback URL.",
    };
  }
  return {
    ok: true,
    signedUrl: data.signedUrl,
    expiresIn: PLAYBACK_URL_TTL_SECONDS,
  };
}
