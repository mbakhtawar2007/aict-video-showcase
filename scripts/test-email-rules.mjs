// Phase 1 unit test for lib/email.ts (student-domain rules).
// Run: node scripts/test-email-rules.mjs
// Uses node:test and imports the real implementation (Node 24
// strips erasable TypeScript). No network, no Supabase, no secrets.
import test from "node:test";
import assert from "node:assert/strict";
import { validateStudentEmail, normalizeEmail } from "../lib/email.ts";

const cases = [
  // [input, expected ok, expected email/error fragment]
  ["ali@students.duet.edu.pk", true, "ali@students.duet.edu.pk"],
  ["  ALI@Students.DUET.edu.pk  ", true, "ali@students.duet.edu.pk"],
  ["ali+tag@students.duet.edu.pk", false, "+ alias"],
  ["ali@duet.edu.pk", false, "students.duet.edu.pk"],
  ["ali@sub.students.duet.edu.pk", false, "students.duet.edu.pk"],
  ["ali@students.duet.edu.pk.evil.com", false, "students.duet.edu.pk"],
  ["ali@students.duet.edu.pk@", false, "valid email"],
  ["@students.duet.edu.pk", false, "valid email"],
  ["ali@@students.duet.edu.pk", false, "valid email"],
  ["", false, "university email"],
  ["not-an-email", false, "valid email"],
  ["teacher1@duet.edu.pk", false, "students.duet.edu.pk"],
  ["teacher2@duet.edu.pk", false, "students.duet.edu.pk"],
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
