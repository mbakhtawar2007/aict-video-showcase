// Phase 1 — POST /api/auth/verify-code (spec §5.1 step 3).
// Verifies the 6-digit email OTP via Supabase verifyOtp (type email).
// On success, updates profiles.last_verified_at via the service-role
// client when configured (owner RLS does not grant that column), and
// reports whether onboarding is still pending. With placeholder env
// this route returns configured:false and never creates a session.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPlaceholderSupabaseEnv,
  validateStudentEmail,
} from "@/lib/email";
import { codeSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = codeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid code." },
      { status: 400 },
    );
  }
  const checked = validateStudentEmail(parsed.data.email);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  if (isPlaceholderSupabaseEnv()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error:
        "Supabase is not configured yet (placeholder env). " +
        "No code can be verified until the new AICT Supabase project is connected.",
    });
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: checked.email,
    token: parsed.data.code,
    type: "email",
  });
  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Code verification failed." },
      { status: 400 },
    );
  }

  // last_verified_at: best-effort via service role; a missing service
  // key must not turn a successful sign-in into a failure.
  const admin = createAdminClient();
  if (admin) {
    await admin
      .from("profiles")
      .update({ last_verified_at: new Date().toISOString() })
      .eq("id", data.user.id);
  }

  let onboarded = false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", data.user.id)
    .single();
  if (profile?.onboarded_at) {
    onboarded = true;
  }
  return NextResponse.json({ ok: true, onboarded });
}
