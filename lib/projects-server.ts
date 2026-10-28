// AICT Phase 2 — server-only helpers for the /api/projects routes.
// NEVER import from a client component. These helpers assume the
// caller already returned configured:false under placeholder env;
// they only run when Supabase is configured (Phase 1 pattern).
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectRow = {
  id: string;
  owner_id: string;
  group_id: string | null;
  title: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  concept: string | null;
  story: string | null;
  genre: string | null;
  tools_used: string[];
  video_path: string | null;
  video_status: string;
  video_size_bytes: number | null;
  duration_seconds: number | null;
  thumbnail_path: string | null;
  status: string;
  rules_accepted_at: string | null;
  vote_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export const PROJECT_SELECT =
  "id, owner_id, group_id, title, slug, tagline, description, concept, story, genre, tools_used, video_path, video_status, video_size_bytes, duration_seconds, thumbnail_path, status, rules_accepted_at, vote_count, view_count, created_at, updated_at";

/** True when the signed-in user may edit this project: owner,
 * group member, or admin (via their profiles row). RLS is the
 * real gate; this is the route-level check that produces clear
 * 403/404 responses instead of leaking RLS denials. */
export async function canEditProject(
  supabase: SupabaseClient,
  userId: string,
  project: { owner_id: string; group_id: string | null },
): Promise<boolean> {
  if (project.owner_id === userId) return true;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if ((profile as { role?: string } | null)?.role === "admin") return true;
  if (!project.group_id) return false;
  const { data: member } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", project.group_id)
    .eq("user_id", userId)
    .single();
  return member !== null;
}

/** Find the first free slug: base, base-2, ... (max 20 tries). */
export async function findFreeSlug(
  supabase: SupabaseClient,
  candidates: string[],
): Promise<string | null> {
  for (const slug of candidates) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("slug", slug)
      .single();
    if (!data) return slug;
  }
  return null;
}
