// AICT Phase 1 — university-email rules (2026-10-28 domain change).
//
// Locked rules (supersedes the earlier students.duet.edu.pk rule):
//  * One university domain for BOTH teachers and students:
//    duet.edu.pk, exact match only.
//  * allow_subdomains = false, so subdomains of that domain are
//    rejected — including students.duet.edu.pk, which is now a
//    subdomain and is therefore REJECTED.
//  * No +tag aliases (a '+' anywhere in the local part is rejected).
//  * roster_mode = false, so no allowlist row is needed to pass the
//    domain check.
//  * This module checks DOMAIN only. Teachers vs students are
//    distinguished separately by email_allowlist role (admin vs
//    default student), never by domain. There is no separate
//    teacher domain and no domain bypass in this module.
//  * Teachers are SKIPPED FOR NOW only in the sense that no real
//    teacher/admin allowlist rows are seeded yet; a @duet.edu.pk
//    address passes this domain check regardless of role.
//
// This module is pure (no network, no env) so it can be unit-tested
// without a live Supabase project. The same checks run again on the
// server in /api/auth/request-code; the client copy is only a hint.
// The Before User Created hook (migration 0002) is the final guard.

export const UNIVERSITY_DOMAIN = "duet.edu.pk";

// Backwards-compatible name for the single allowed domain.
export const STUDENT_DOMAIN = UNIVERSITY_DOMAIN;

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
  if (domain !== UNIVERSITY_DOMAIN) {
    return {
      ok: false,
      error: `Only ${UNIVERSITY_DOMAIN} addresses can sign in.`,
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
