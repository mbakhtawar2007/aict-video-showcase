// AICT Phase 1 — student-email rules (students only, 2026-10-28 decision).
//
// Locked rules:
//  * Students only on students.duet.edu.pk, exact match only.
//  * allow_subdomains = false, so subdomains of that domain are rejected.
//  * No +tag aliases (a '+' anywhere in the local part is rejected).
//  * roster_mode = false, so no allowlist row is needed for a student.
//  * Teachers are SKIPPED FOR NOW: there is no teacher/admin path in
//    this module. Do not add a duet.edu.pk bypass here; teacher/admin
//    accounts are added later, when real teacher emails arrive.
//
// This module is pure (no network, no env) so it can be unit-tested
// without a live Supabase project. The same checks run again on the
// server in /api/auth/request-code; the client copy is only a hint.
// The Before User Created hook (migration 0002) is the final guard.

export const STUDENT_DOMAIN = "students.duet.edu.pk";

export type EmailCheck =
  | { ok: true; email: string }
  | { ok: false; error: string };

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateStudentEmail(raw: string): EmailCheck {
  const email = normalizeEmail(raw);

  if (!email) {
    return { ok: false, error: "Please enter your university email address." };
  }
  // Exactly one '@', non-empty local and domain parts.
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  const [local, domain] = parts;

  if (local.includes("+")) {
    return {
      ok: false,
      error: "Please use your main university address, without a + alias.",
    };
  }
  // Basic local-part shape: letters, digits and . _ % + - (the '+' case
  // above already returned, so '+' here is unreachable but harmless).
  if (!/^[a-z0-9._%+-]+$/.test(local)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (domain !== STUDENT_DOMAIN) {
    return {
      ok: false,
      error: `Only ${STUDENT_DOMAIN} addresses can sign in.`,
    };
  }
  return { ok: true, email };
}

export function isPlaceholderSupabaseEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return (
    !url ||
    !anon ||
    url.includes("PLACEHOLDER") ||
    anon.includes("PLACEHOLDER")
  );
}
