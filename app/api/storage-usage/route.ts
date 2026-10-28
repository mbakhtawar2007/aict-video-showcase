// Phase 2 — GET /api/storage-usage.
//
// Global Storage counter for the free tier: used bytes / 1 GB,
// warn at 80%, block new publishes at 100% (the publish block
// itself is enforced in the publish flow, not here — this route
// only reports the flags). The counter is DB-derived: the sum
// of projects.video_size_bytes for rows that have a video.
// That deliberately UNDERCOUNTS orphaned objects (a deleted
// project's file left behind, or a failed upload never linked),
// so the live admin panel must reconcile it against the Storage
// API before treating "not full" as proof. Under placeholder
// env: configured:false with the caps documented, never a fake
// zero. When Supabase is configured but no service-role key is
// set, the global total cannot be computed through RLS (a user
// client only sees their own projects), so the route reports
// that gap instead of a partial sum.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import {
  computeStorageUsage,
  TOTAL_STORAGE_BYTES,
  STORAGE_WARN_RATIO,
} from "@/lib/video";

export async function GET() {
  const caps = {
    totalBytes: TOTAL_STORAGE_BYTES,
    warnAtBytes: Math.ceil(TOTAL_STORAGE_BYTES * STORAGE_WARN_RATIO),
    warnRatio: STORAGE_WARN_RATIO,
  };
  if (isPlaceholderSupabaseEnv()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Supabase is not configured yet.",
        ...caps,
        note: "Caps are documented here only; no live usage exists yet.",
      },
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
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error:
          "Storage usage needs the server service key for a global total; it is not configured yet.",
        ...caps,
      },
      { status: 503 },
    );
  }
  const { data, error } = await admin
    .from("projects")
    .select("video_size_bytes")
    .not("video_size_bytes", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const used = (data ?? []).reduce(
    (sum, row) =>
      sum + ((row as { video_size_bytes: number | null }).video_size_bytes ?? 0),
    0,
  );
  const usage = computeStorageUsage(used);
  return NextResponse.json({
    ok: true,
    ...usage,
    ...caps,
    source: "sum of projects.video_size_bytes (DB-derived; orphans not counted)",
  });
}
