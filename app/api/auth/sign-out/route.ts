// Phase 1 — POST /api/auth/sign-out. Clears the HTTP-only session
// cookies via the server Supabase client. Idempotent: signing out
// with no session (or placeholder env) still returns ok.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlaceholderSupabaseEnv } from "@/lib/email";

export async function POST() {
  if (isPlaceholderSupabaseEnv()) {
    return NextResponse.json({ ok: true, configured: false });
  }
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
