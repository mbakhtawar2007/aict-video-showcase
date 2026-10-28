// Phase 2 unit tests for lib/video.ts + lib/projects.ts.
// Run: node scripts/test-video-rules.mjs
// Uses node:test and imports the real implementations (Node strips
// erasable TypeScript). No network, no Supabase, no secrets.
//
// A "good MP4 header" is built by hand: 4-byte box size, "ftyp",
// major brand "isom", minor version. A renamed non-video (e.g. a
// PNG header, or plain text) has no ftyp box. MOV uses brand
// "qt  ", HEVC uses "hev1", WebM uses the EBML magic bytes.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateVideoMime,
  validateVideoExtension,
  validateVideoSize,
  validateVideoMagicBytes,
  validateVideoDuration,
  validatePickedVideo,
  computeStorageUsage,
  formatBytes,
  MAX_VIDEO_BYTES,
  TOTAL_STORAGE_BYTES,
  EXPORT_AS_MP4_MESSAGE,
} from "../lib/video.ts";
import { slugifyTitle, slugCandidates, videoObjectPath } from "../lib/projects.ts";

function mp4Header(brand) {
  const bytes = new Uint8Array(24);
  // Box size (24) big-endian.
  bytes[0] = 0; bytes[1] = 0; bytes[2] = 0; bytes[3] = 24;
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
  for (let i = 0; i < 4; i++) bytes[8 + i] = brand.charCodeAt(i);
  return bytes;
}

test("good MP4 header (isom) passes magic check", () => {
  assert.deepEqual(validateVideoMagicBytes(mp4Header("isom")), { ok: true });
});

test("good MP4 header (mp42) passes magic check", () => {
  assert.deepEqual(validateVideoMagicBytes(mp4Header("mp42")), { ok: true });
});

test("renamed non-video (PNG header) fails magic check", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const result = validateVideoMagicBytes(png);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes("not a valid MP4"));
});

test("renamed text file fails magic check", () => {
  const text = new TextEncoder().encode("hello this is not a video file at all");
  const result = validateVideoMagicBytes(text);
  assert.equal(result.ok, false);
});

test("MOV (qt brand) is rejected with the locked message", () => {
  assert.deepEqual(validateVideoMagicBytes(mp4Header("qt  ")), {
    ok: false,
    error: EXPORT_AS_MP4_MESSAGE,
  });
});

test("HEVC (hev1 brand) is rejected with the locked message", () => {
  assert.deepEqual(validateVideoMagicBytes(mp4Header("hev1")), {
    ok: false,
    error: EXPORT_AS_MP4_MESSAGE,
  });
});

test("WebM (EBML magic) is rejected with the locked message", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(validateVideoMagicBytes(webm), {
    ok: false,
    error: EXPORT_AS_MP4_MESSAGE,
  });
});

test("unknown ISO-BMFF brand is rejected, not guessed", () => {
  const result = validateVideoMagicBytes(mp4Header("xxxx"));
  assert.equal(result.ok, false);
  assert.ok(result.error.includes("not a recognised H.264 MP4"));
});

test("MIME: video/mp4 passes, video/quicktime and video/webm fail", () => {
  assert.deepEqual(validateVideoMime("video/mp4"), { ok: true });
  assert.deepEqual(validateVideoMime("video/mp4; codecs=avc1.42E01E"), { ok: true });
  assert.deepEqual(validateVideoMime("video/quicktime"), {
    ok: false,
    error: EXPORT_AS_MP4_MESSAGE,
  });
  assert.deepEqual(validateVideoMime("video/webm"), {
    ok: false,
    error: EXPORT_AS_MP4_MESSAGE,
  });
});

test("extension: .mp4 passes (case-insensitive), .mov fails", () => {
  assert.deepEqual(validateVideoExtension("clip.mp4"), { ok: true });
  assert.deepEqual(validateVideoExtension("Clip.MP4"), { ok: true });
  assert.deepEqual(validateVideoExtension("clip.mov"), {
    ok: false,
    error: EXPORT_AS_MP4_MESSAGE,
  });
});

test("size: 50 MB boundary passes, 50 MB + 1 byte fails", () => {
  assert.deepEqual(validateVideoSize(MAX_VIDEO_BYTES), { ok: true });
  assert.equal(validateVideoSize(MAX_VIDEO_BYTES + 1).ok, false);
  assert.equal(validateVideoSize(0).ok, false);
});

test("duration: 120s passes, 121s fails, unknown fails", () => {
  assert.deepEqual(validateVideoDuration(120), { ok: true });
  assert.equal(validateVideoDuration(121).ok, false);
  assert.equal(validateVideoDuration(null).ok, false);
  assert.equal(validateVideoDuration(undefined).ok, false);
});

test("combined picked-file check rejects a MOV-named file", () => {
  const result = validatePickedVideo({
    mime: "video/quicktime",
    fileName: "clip.mov",
    sizeBytes: 1024,
  });
  assert.equal(result.ok, false);
});

test("storage usage: warn at 80%, block at 100%", () => {
  const empty = computeStorageUsage(0);
  assert.equal(empty.warn, false);
  assert.equal(empty.block, false);
  // 80% of 1 GB is not a whole byte (858993459.2), so the first
  // byte at/above 80% is the ceiling, and one byte below it warns false.
  const warn = computeStorageUsage(Math.ceil(TOTAL_STORAGE_BYTES * 0.8));
  assert.equal(computeStorageUsage(Math.ceil(TOTAL_STORAGE_BYTES * 0.8) - 1).warn, false);
  assert.equal(warn.warn, true);
  assert.equal(warn.block, false);
  const full = computeStorageUsage(TOTAL_STORAGE_BYTES);
  assert.equal(full.warn, true);
  assert.equal(full.block, true);
});

test("formatBytes renders MB and GB", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(50 * 1024 * 1024), "50.0 MB");
  assert.equal(formatBytes(TOTAL_STORAGE_BYTES), "1.00 GB");
});

test("slugify: lowercase, hyphens, trim, fallback", () => {
  assert.equal(slugifyTitle("My Cool Video! 2026"), "my-cool-video-2026");
  assert.equal(slugifyTitle("!!!"), "project");
  assert.equal(slugifyTitle("  A  B  "), "a-b");
});

test("slug candidates: base then -2, -3", () => {
  assert.deepEqual(slugCandidates("Hello World", 3), [
    "hello-world",
    "hello-world-2",
    "hello-world-3",
  ]);
});

test("video object path is under projects/<id>/", () => {
  assert.equal(
    videoObjectPath("123e4567-e89b-12d3-a456-426614174000"),
    "projects/123e4567-e89b-12d3-a456-426614174000/video.mp4",
  );
});
