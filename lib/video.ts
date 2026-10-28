// AICT Phase 2 — free-video validation (LOCKED delta, 2026-10-28).
//
// Video is Supabase Storage only: private bucket 'videos', MP4
// (H.264) only, no transcoding, no Cloudflare Stream, no Mux, no R2.
// This module is PURE (no network, no env, no Supabase) so it can
// be unit-tested without a live project, exactly like lib/email.ts.
//
// Caps (the spec's 500 MB / 10-minute defaults do NOT apply):
//   per file  <= 50 MB (Supabase free max upload)
//   catalog   <= 1 GB total, warn at 80%, block new publishes at 100%
//   guidance  aim <= 20 MB, <= 2 minutes, 720p (guidance, not a cap)
//   ready     = file present + MIME + magic bytes validated as
//               MP4/H.264 + size and duration within caps
//
// Rejection wording (locked): non-MP4 formats are rejected with
//   "Export as H.264 MP4 and try again."
//
// DURATION CAVEAT (honest limit, read this before trusting it):
//   a browser File object exposes duration only via a <video>
//   element's metadata, and a server route receives only whatever
//   the client claims unless it inspects the uploaded bytes. So
//   the client-supplied duration is treated as a HINT: the upload
//   wizard checks it client-side, complete-upload stores it only
//   after the file itself passed MIME/magic/size checks, and the
//   server MUST re-check duration from the real file (ffprobe /
//   mp4box-style parse) once Storage is live. Until that server
//   parse exists, a client could lie about duration — the 2-minute
//   cap is therefore enforced client-side and documented, not
//   proven server-side. The duration_seconds column is still
//   populated so the gallery duration badge works in Phase 3.

export const VIDEO_BUCKET = "videos";

// Bytes, not MiB: 50 * 1000 * 1000 would also be defensible, but
// Supabase/JS File.size is bytes and the delta says "50 MB", so
// use binary megabytes consistently everywhere in this module.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const RECOMMENDED_VIDEO_BYTES = 20 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 120; // <= 2 minutes guidance-as-cap
export const RECOMMENDED_DURATION_SECONDS = 120;
export const TOTAL_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB
export const STORAGE_WARN_RATIO = 0.8;
export const EXPORT_AS_MP4_MESSAGE = "Export as H.264 MP4 and try again.";

export type VideoCheck =
  | { ok: true }
  | { ok: false; error: string };

const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "dash",
  "mmp4",
]);

const HEVC_BRANDS = new Set(["hev1", "hvc1", "hevc", "hevx"]);

/** Normalize a MIME type: lowercase, strip "; codecs=..." params. */
export function normalizeMime(mime: string): string {
  return mime.trim().toLowerCase().split(";")[0].trim();
}

/** Accept only video/mp4. Anything else gets the locked message. */
export function validateVideoMime(mime: string): VideoCheck {
  if (normalizeMime(mime) === "video/mp4") {
    return { ok: true };
  }
  return { ok: false, error: EXPORT_AS_MP4_MESSAGE };
}

/** File name must end in .mp4 (case-insensitive). */
export function validateVideoExtension(fileName: string): VideoCheck {
  const name = fileName.trim().toLowerCase();
  if (name.endsWith(".mp4") && name.length > 4) {
    return { ok: true };
  }
  return { ok: false, error: EXPORT_AS_MP4_MESSAGE };
}

/** Hard cap: <= 50 MB. */
export function validateVideoSize(sizeBytes: number): VideoCheck {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "That file looks empty. Choose a video file." };
  }
  if (sizeBytes > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      error: `That video is over 50 MB. ${EXPORT_AS_MP4_MESSAGE.replace("Export as H.264 MP4", "Export a smaller H.264 MP4")}`,
    };
  }
  return { ok: true };
}

/** Guidance only: true when the file is within the <= 20 MB aim. */
export function isWithinRecommendedSize(sizeBytes: number): boolean {
  return sizeBytes <= RECOMMENDED_VIDEO_BYTES;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

/**
 * Magic-byte check on the first bytes of the file.
 * A real MP4 starts with a 4-byte box size, then "ftyp", then a
 * 4-byte major brand. WebM starts with the EBML header
 * 1A 45 DF A3; a renamed .txt/.png/.zip fails the ftyp test.
 * MOV (brand "qt  ") and HEVC (hev1/hvc1) are rejected with the
 * locked message even though they are ISO-BMFF files, because
 * the free path has no transcoding to convert them.
 */
export function validateVideoMagicBytes(header: Uint8Array): VideoCheck {
  if (header.length >= 4 &&
      header[0] === 0x1a && header[1] === 0x45 &&
      header[2] === 0xdf && header[3] === 0xa3) {
    return { ok: false, error: EXPORT_AS_MP4_MESSAGE };
  }
  if (header.length < 12) {
    return {
      ok: false,
      error: "That file is not a valid MP4. " + EXPORT_AS_MP4_MESSAGE,
    };
  }
  if (ascii(header, 4, 4) !== "ftyp") {
    return {
      ok: false,
      error: "That file is not a valid MP4. " + EXPORT_AS_MP4_MESSAGE,
    };
  }
  const brand = ascii(header, 8, 4);
  if (brand === "qt  ") {
    return { ok: false, error: EXPORT_AS_MP4_MESSAGE };
  }
  if (HEVC_BRANDS.has(brand)) {
    return { ok: false, error: EXPORT_AS_MP4_MESSAGE };
  }
  if (MP4_BRANDS.has(brand)) {
    return { ok: true };
  }
  // Unknown ISO-BMFF brand: do not guess. The H.264-in-MP4 brands
  // above are the accepted set; anything else is rejected rather
  // than risking an unplayable file in the no-transcode path.
  return {
    ok: false,
    error: "That file is not a recognised H.264 MP4. " + EXPORT_AS_MP4_MESSAGE,
  };
}

/**
 * Duration check. null/undefined means "could not be read" and is
 * a failure, not a pass — see the DURATION CAVEAT at the top.
 */
export function validateVideoDuration(
  durationSeconds: number | null | undefined,
): VideoCheck {
  if (durationSeconds === null || durationSeconds === undefined ||
      !Number.isFinite(durationSeconds)) {
    return {
      ok: false,
      error: "Could not read this video's duration. Try re-exporting it as H.264 MP4.",
    };
  }
  if (durationSeconds <= 0) {
    return { ok: false, error: "That video has no playable duration." };
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return {
      ok: false,
      error: `Videos must be 2 minutes or shorter (this one is ${Math.ceil(durationSeconds)} seconds).`,
    };
  }
  return { ok: true };
}

/** Combined check for a picked file (MIME + extension + size). */
export function validatePickedVideo(input: {
  mime: string;
  fileName: string;
  sizeBytes: number;
}): VideoCheck {
  const checks = [
    validateVideoMime(input.mime),
    validateVideoExtension(input.fileName),
    validateVideoSize(input.sizeBytes),
  ];
  for (const check of checks) {
    if (!check.ok) return check;
  }
  return { ok: true };
}

export type StorageUsage = {
  usedBytes: number;
  totalBytes: number;
  percent: number;
  warn: boolean;
  block: boolean;
};

/** Storage counter: warn at 80% of 1 GB, block new publishes at 100%. */
export function computeStorageUsage(usedBytes: number): StorageUsage {
  const used = Math.max(0, Math.floor(usedBytes) || 0);
  const percent = (used / TOTAL_STORAGE_BYTES) * 100;
  // Integer comparison so the 80% boundary is exact (floating
  // 0.8 * 1 GB floors to one byte under the threshold).
  // STORAGE_WARN_RATIO (0.8) in exact integer form: used * 5 >= total * 4.
  const warn = used * 5 >= TOTAL_STORAGE_BYTES * 4;
  return {
    usedBytes: used,
    totalBytes: TOTAL_STORAGE_BYTES,
    percent: Math.round(percent * 10) / 10,
    warn,
    block: used >= TOTAL_STORAGE_BYTES,
  };
}

/** Human size, e.g. 12.5 MB / 850 MB / 1.00 GB. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}
