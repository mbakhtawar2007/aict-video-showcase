// Phase 3 unit tests for lib/gallery.ts.
// Run: node scripts/test-gallery-rules.mjs
// Uses node:test and imports the real implementation (Node strips
// erasable TypeScript). No network, no Supabase, no secrets.
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDuration,
  sanitizeSearchQuery,
  parseGalleryParams,
  encodeCursor,
  decodeCursor,
  cursorForRow,
  GALLERY_PAGE_SIZE,
} from "../lib/gallery.ts";

test("formatDuration: seconds to m:ss, null stays null", () => {
  assert.equal(formatDuration(95), "1:35");
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(600), "10:00");
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(-5), null);
});

test("sanitizeSearchQuery: trims and escapes ilike wildcards", () => {
  assert.equal(sanitizeSearchQuery("  ali%_ "), "ali\\%\\_");
  assert.equal(sanitizeSearchQuery(null), "");
  assert.equal(sanitizeSearchQuery("  khan  "), "khan");
});

test("parseGalleryParams: defaults are newest + page size", () => {
  const p = parseGalleryParams(new URLSearchParams(""));
  assert.equal(p.sort, "newest");
  assert.equal(p.limit, GALLERY_PAGE_SIZE);
  assert.equal(p.cursor, null);
  assert.equal(p.cursorInvalid, false);
});

test("parseGalleryParams: unknown sort falls back, limit clamps", () => {
  const p = parseGalleryParams(new URLSearchParams("sort=bogus&limit=999"));
  assert.equal(p.sort, "newest");
  assert.equal(p.limit, 24);
});

test("parseGalleryParams: valid params pass through", () => {
  const p = parseGalleryParams(
    new URLSearchParams("query=ali&genre=Drama&tool=Runway&group=abc&sort=most_voted&limit=5"),
  );
  assert.equal(p.query, "ali");
  assert.equal(p.genre, "Drama");
  assert.equal(p.tool, "Runway");
  assert.equal(p.group, "abc");
  assert.equal(p.sort, "most_voted");
  assert.equal(p.limit, 5);
});

test("cursor round-trip for every sort, and cross-sort rejection", () => {
  const row = {
    id: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-10-29T10:00:00.000Z",
    vote_count: 7,
    view_count: 42,
  };
  for (const sort of ["newest", "most_voted", "trending", "most_viewed"]) {
    const encoded = cursorForRow(sort, row);
    const decoded = decodeCursor(encoded, sort);
    assert.ok(decoded, `cursor decodes for ${sort}`);
    assert.equal(decoded.id, row.id);
    assert.equal(decoded.created_at, row.created_at);
  }
  // A cursor minted for one sort must not work for another.
  const voted = cursorForRow("most_voted", row);
  assert.equal(decodeCursor(voted, "newest"), null);
  assert.equal(decodeCursor(voted, "most_viewed"), null);
  // Garbage is rejected, not treated as page one.
  assert.equal(decodeCursor("not-a-cursor!!!", "newest"), null);
  const p = parseGalleryParams(new URLSearchParams("cursor=not-a-cursor!!!"));
  assert.equal(p.cursorInvalid, true);
});

test("encodeCursor is opaque (not a bare id)", () => {
  const encoded = encodeCursor({
    sort: "newest",
    created_at: "2026-10-29T10:00:00.000Z",
    id: "abc",
  });
  assert.ok(!encoded.includes("abc"));
});
