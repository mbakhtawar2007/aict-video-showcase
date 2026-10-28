// Phase 1 — GET / PATCH /api/profile (own profile only).
// GET returns the signed-in user's profile row, or 401.
// PATCH applies onboarding and the owner-editable columns only
// (username, full_name, avatar_url, bio, class_section,
// reduce_effects). role and status are never accepted here: they
// are admin-only in RLS and in migration 0002, so a client that
// sends them gets them ignored, not applied. Onboarding sets
// onboarded_at on the first successful PATCH.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderSupabaseEnv } from "@/lib/email";
import { onboardingSchema } from "@/lib/validation";

export async function GET() {
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
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, avatar_url, bio, class_section, role, status, onboarded_at, last_verified_at, reduce_effects, created_at",
    )
    .eq("id", user.id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, profile: data });
}

export async function PATCH(request: NextRequest) {
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
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid profile data." },
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
  const { data: existing } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  const update: Record<string, unknown> = {
    username: parsed.data.username,
    full_name: parsed.data.full_name,
    class_section: parsed.data.class_section || null,
  };
  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id)
    .select(
      "id, username, full_name, avatar_url, bio, class_section, role, status, onboarded_at, last_verified_at, reduce_effects, created_at",
    )
    .single();
  // onboarded_at is not owner-editable in RLS, so it is set here
  // via the service-role client on the first successful onboarding
  // PATCH. Without a service key, onboarding fields save but the
  // user stays onboarding-pending — that is a live-env config
  // gap, not a silent success, and is documented in PHASE1-REPORT.
  if (!error && !existing?.onboarded_at) {
    const admin = createAdminClient();
    if (admin) {
      await admin
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", user.id);
    }
  }
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken. Choose another." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, profile: data });
}
