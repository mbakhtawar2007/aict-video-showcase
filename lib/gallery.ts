// AICT Phase 3 — gallery helpers (PURE, no network, no env, no
// Supabase), so they can be unit-tested like lib/email.ts and
// lib/video.ts. The gallery API route and the /explore page both
// use these definitions; neither re-invents sort/cursor rules.
//
// Locked constraints honoured here:
//  * Gallery rows are published projects ONLY (enforced in the
//    API route, not here — this module only validates params).
//  * No fake data: there is no seed, placeholder, or example
//    project anywhere in this module.
//  * Trending is INTERIM (see GALLERY_SORTS): the spec §4.2
//    trending score needs votes/views in the last 48h, which
//    needs the Phase 4 votes table. Until then trending means
//    "most votes, newest first" — the same deterministic keyset
//    as most_voted, documented in PHASE3-REPORT.md, not hidden.

export const GALLERY_SORTS = ["newest", "most_voted", "trending", "most_viewed"] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number];

export const GALLERY_PAGE_SIZE = 12;
export const GALLERY_MAX_LIMIT = 24;

export function isGallerySort(value: unknown): value is GallerySort {
  return (
    typeof value === "string" &&
    (GALLERY_SORTS as readonly string[]).includes(value)
  );
}

/** Format a duration in seconds as m:ss (e.g. 95 -> "1:35"). */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Sanitize a free-text gallery search term for a PostgREST ilike
 * pattern: trim, cap length, and escape the ilike wildcards so a
 * user cannot turn a search into a pattern match.
 */
export function sanitizeSearchQuery(raw: string | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .slice(0, 100)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

export type GalleryCursor =
  | { sort: "newest"; created_at: string; id: string }
  | { sort: "most_voted" | "trending"; vote_count: number; created_at: string; id: string }
  | { sort: "most_viewed"; view_count: number; created_at: string; id: string };

/** Opaque cursor: base64url JSON, never a raw row id on its own. */
export function encodeCursor(cursor: GalleryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}

/**
 * Decode + validate a cursor for the requested sort. Returns null
 * for anything malformed, wrong-shaped, or for another sort — the
 * API route then treats it as "no cursor" is WRONG, so callers
 * must return a 400 for a non-null raw cursor that decodes to
 * null (see parseGalleryParams).
 */
export function decodeCursor(raw: string | null, sort: GallerySort): GalleryCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf-8"),
    );
    if (typeof parsed !== "object" || parsed === null) return null;
    const c = parsed as Record<string, unknown>;
    if (c.sort !== sort) return null;
    if (typeof c.created_at !== "string" || typeof c.id !== "string") return null;
    if (sort === "newest") return { sort, created_at: c.created_at, id: c.id };
    if (sort === "most_viewed") {
      if (typeof c.view_count !== "number") return null;
      return { sort, view_count: c.view_count, created_at: c.created_at, id: c.id };
    }
    if (typeof c.vote_count !== "number") return null;
    return { sort, vote_count: c.vote_count, created_at: c.created_at, id: c.id };
  } catch {
    return null;
  }
}

export type GalleryParams = {
  query: string;
  genre: string;
  tool: string;
  group: string;
  sort: GallerySort;
  limit: number;
  cursor: GalleryCursor | null;
  cursorInvalid: boolean;
};

/** Parse + validate gallery query params from a URLSearchParams. */
export function parseGalleryParams(params: URLSearchParams): GalleryParams {
  const sortRaw = params.get("sort");
  const sort: GallerySort = isGallerySort(sortRaw) ? sortRaw : "newest";
  const limitRaw = Number(params.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), GALLERY_MAX_LIMIT)
      : GALLERY_PAGE_SIZE;
  const rawCursor = params.get("cursor");
  const cursor = decodeCursor(rawCursor, sort);
  return {
    query: sanitizeSearchQuery(params.get("query")),
    genre: (params.get("genre") ?? "").trim().slice(0, 100),
    tool: (params.get("tool") ?? "").trim().slice(0, 100),
    group: (params.get("group") ?? "").trim().slice(0, 100),
    sort,
    limit,
    cursor,
    cursorInvalid: rawCursor !== null && cursor === null,
  };
}

/** Build the next-page cursor from the last row of a page. */
export function cursorForRow(
  sort: GallerySort,
  row: { id: string; created_at: string; vote_count: number; view_count: number },
): string {
  if (sort === "newest") {
    return encodeCursor({ sort, created_at: row.created_at, id: row.id });
  }
  if (sort === "most_viewed") {
    return encodeCursor({
      sort,
      view_count: row.view_count,
      created_at: row.created_at,
      id: row.id,
    });
  }
  return encodeCursor({
    sort,
    vote_count: row.vote_count,
    created_at: row.created_at,
    id: row.id,
  });
}
