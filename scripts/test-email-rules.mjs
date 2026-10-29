// Phase 1 unit test for lib/email.ts (university-domain rules).
// Run: node scripts/test-email-rules.mjs
// Uses node:test and imports the real implementation (Node 24
// strips erasable TypeScript). No network, no Supabase, no secrets.
//
// Domain rule (2026-10-29 change, superseding the 2026-10-28
// exact-match rule): an address passes iff its domain, after
// lowercasing/trimming, is exactly duet.edu.pk OR ends with
// ".duet.edu.pk" (students.duet.edu.pk and any other real DUET
// subdomain pass). Still rejected: other domains, lookalikes
// without a dot before duet (fakeduet.edu.pk), suffix tricks
// (duet.edu.pk.evil.com), and +tag aliases.
// IMPORTANT DISTINCTION: this test checks DOMAIN only.
// teacher1@duet.edu.pk / teacher2@duet.edu.pk therefore PASS the
// domain check — they are @duet.edu.pk addresses. Whether such an
// address is an admin is decided separately by email_allowlist
// role, not by this module, and migration 0002 still deletes
// those two placeholder rows (they are not real teachers).
import test from "node:test";
import assert from "node:assert/strict";
import { validateStudentEmail, normalizeEmail } from "../lib/email.ts";

const cases = [
  // [input, expected ok, expected email/error fragment]
  ["ali@duet.edu.pk", true, "ali@duet.edu.pk"],
  ["  ALI@DUET.edu.pk  ", true, "ali@duet.edu.pk"],
  ["ali+tag@duet.edu.pk", false, "+ alias"],
  // New rule: DUET subdomains pass (changed from the 2026-10-28
  // exact-match rule, which rejected these two).
  ["ali@students.duet.edu.pk", true, "ali@students.duet.edu.pk"],
  ["ali@sub.duet.edu.pk", true, "ali@sub.duet.edu.pk"],
  ["ali@dept.duet.edu.pk", true, "ali@dept.duet.edu.pk"],
  ["26F-CS-052@Students.duet.edu.pk", true, "26f-cs-052@students.duet.edu.pk"],
  ["ali+tag@students.duet.edu.pk", false, "+ alias"],
  // Lookalikes and other domains must NOT pass.
  ["ali@fakeduet.edu.pk", false, "ending in .duet.edu.pk"],
  ["ali@notduet.edu.pk", false, "ending in .duet.edu.pk"],
  ["ali@gmail.com", false, "ending in .duet.edu.pk"],
  ["ali@duet.edu.pk.evil.com", false, "ending in .duet.edu.pk"],
  ["ali@duet.edu.pk@", false, "valid email"],
  ["@duet.edu.pk", false, "valid email"],
  ["ali@@duet.edu.pk", false, "valid email"],
  ["", false, "university email"],
  ["not-an-email", false, "valid email"],
  // Domain passes; role is an allowlist matter, not a domain matter.
  ["teacher1@duet.edu.pk", true, "teacher1@duet.edu.pk"],
  ["teacher2@duet.edu.pk", true, "teacher2@duet.edu.pk"],
];

for (const [input, ok, fragment] of cases) {
  test(`validateStudentEmail(${JSON.stringify(input)})`, () => {
    const result = validateStudentEmail(input);
    assert.equal(result.ok, ok);
    if (ok) {
      assert.equal(result.email, fragment);
    } else {
      assert.ok(
        result.error.includes(fragment),
        `expected error to include ${JSON.stringify(fragment)}, got ${JSON.stringify(result.error)}`,
      );
    }
  });
}

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Ali@Example.COM "), "ali@example.com");
});
