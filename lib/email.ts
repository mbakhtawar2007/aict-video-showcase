// AICT Phase 1 — university-email rules (2026-10-29 domain change).
//
// Locked rules (supersedes the 2026-10-28 exact-match rule, which
// rejected real student addresses on students.duet.edu.pk):
//  * The teacher domain is unknown, so the rule is a SUFFIX rule,
//    not a single domain: an address passes if and only if its
//    domain, after lowercasing/trimming, is exactly duet.edu.pk
//    OR ends with ".duet.edu.pk" (e.g. students.duet.edu.pk, and
//    any other real DUET subdomain). This matches the Before User
//    Created hook in migration 0002, which honours
//    allowed_email_domains.allow_subdomains via a suffix check
//    (right(domain, len+1) = '.' || domain) — so the live hook
//    needs only the 0004 flag flip (allow_subdomains = true for
//    the duet.edu.pk row), not a reinstall.
//  * Still REJECTED: any other domain; lookalikes with no dot
//    before duet (fakeduet.edu.pk); suffix tricks
//    (duet.edu.pk.evil.com); unrelated subdomains
//    (notduet.edu.pk is not a DUET subdomain at all).
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
  // Suffix rule: exactly duet.edu.pk, or any subdomain of it.
  // The leading dot in the endsWith check is what keeps
  // fakeduet.edu.pk (no dot before duet) rejected.
  if (
    domain !== UNIVERSITY_DOMAIN &&
    !domain.endsWith(`.${UNIVERSITY_DOMAIN}`)
  ) {
    return {
      ok: false,
      error: `Only addresses ending in .${UNIVERSITY_DOMAIN} can sign in.`,
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
