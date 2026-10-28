// AICT Phase 2 — project helpers (pure, no network, no Supabase).
// Slug rules: lowercase, runs of non-alphanumerics become one
// hyphen, trimmed, max 60 chars, fallback "project". Collision
// handling (slug, slug-2, slug-3, ...) lives in the POST route,
// which checks the database; this module only builds candidates.

export function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "project";
}

/** Candidate slugs in order: base, base-2, base-3, ... */
export function slugCandidates(title: string, maxAttempts = 20): string[] {
  const base = slugifyTitle(title);
  const out = [base];
  for (let i = 2; i <= maxAttempts; i++) {
    out.push(`${base}-${i}`);
  }
  return out;
}

/** Storage object path for a project's video (locked delta). */
export function videoObjectPath(projectId: string): string {
  return `projects/${projectId}/video.mp4`;
}

export const PROJECT_STATUSES = ["draft", "published", "hidden"] as const;
export const VIDEO_STATUSES = [
  "none",
  "uploading",
  "processing",
  "ready",
  "failed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(value)
  );
}
