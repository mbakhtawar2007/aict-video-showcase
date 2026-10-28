// Phase 1 — POST /api/auth/request-code (spec §5.1 step 2).
// Server flow: normalize email -> student-domain check -> rate limits
// (per-email, per-IP) -> Supabase signInWithOtp. Turnstile is
// env-gated for live only: if NEXT_PUBLIC_TURNSTILE_SITE_KEY and
// TURNSTILE_SECRET_KEY are set, a turnstileToken field is required
// and verified; in the local build with placeholders it is skipped
// and documented as a live step, never faked as verified.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isPlaceholderSupabaseEnv,
  validateStudentEmail,
} from "@/lib/email";
import {
  REQUEST_CODE_LIMITS,
  checkRateLimit,
} from "@/lib/rate-limit";
import { emailSchema } from "@/lib/validation";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown-ip";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid email." },
      { status: 400 },
    );
  }
  const checked = validateStudentEmail(parsed.data.email);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const email = checked.email;

  const perEmail = checkRateLimit(
    `request-code:email:${email}`,
    REQUEST_CODE_LIMITS.perEmail.limit,
    REQUEST_CODE_LIMITS.perEmail.windowMs,
  );
  if (!perEmail.allowed) {
    return NextResponse.json(
      {
        error: `Too many code requests for this email. Try again in ${perEmail.retryAfterSeconds} seconds.`,
      },
      { status: 429 },
    );
  }
  const perIp = checkRateLimit(
    `request-code:ip:${clientIp(request)}`,
    REQUEST_CODE_LIMITS.perIp.limit,
    REQUEST_CODE_LIMITS.perIp.windowMs,
  );
  if (!perIp.allowed) {
    return NextResponse.json(
      {
        error: `Too many code requests. Try again in ${perIp.retryAfterSeconds} seconds.`,
      },
      { status: 429 },
    );
  }

  // Graceful placeholder behaviour: with no live Supabase project
  // configured, do not pretend a code was sent. The build and the
  // UI still work, and the real OTP path is exercised once env
  // values are real. This is a local-build guard, not a bypass:
  // it returns configured:false and never creates a session.
  if (isPlaceholderSupabaseEnv()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      message:
        "Supabase is not configured yet (placeholder env). No code was sent. " +
        "Connect the new AICT Supabase project to enable OTP delivery.",
    });
  }

  // Live Turnstile gate (only when keys are configured).
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (turnstileSecret) {
    const token = (body as { turnstileToken?: string }).turnstileToken;
    if (!token) {
      return NextResponse.json(
        { error: "Please complete the human check and try again." },
        { status: 400 },
      );
    }
    const verify = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: turnstileSecret, response: token }),
      },
    );
    const result = (await verify.json()) as { success?: boolean };
    if (!result.success) {
      return NextResponse.json(
        { error: "Human check failed. Please try again." },
        { status: 400 },
      );
    }
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    message: "Code sent. Check your university inbox.",
  });
}
