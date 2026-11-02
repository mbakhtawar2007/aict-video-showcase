// AICT Phase 3 — server-only settings reader.
//
// There was NO settings reader in app code before Phase 3 (the
// settings table exists since migration 0001, but no route read
// it). This reader uses the service-role client, because the
// migration 0002 RLS policy on public.settings is admin-only:
// a signed-in non-admin user client cannot read the table at
// all, so a user-client read would always fail closed for the
// exact people the gallery is for. The boolean result is used
// server-side only; the raw settings rows are never returned
// to a client.
//
// Fallback (documented, fail-closed): if the service-role client
// is missing, or the read errors, public browsing is treated as
// OFF. The gallery then stays members-only (401 for visitors),
// exactly as the seeded default ('public_browsing' = false).
// It never fails open to anonymous access.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function readPublicBrowsing(
  admin: SupabaseClient | null,
): Promise<boolean> {
  if (!admin) return false;
  try {
    const { data, error } = await admin
      .from("settings")
      .select("value")
      .eq("key", "public_browsing")
      .single();
    if (error || !data) return false;
    return (data as { value?: unknown }).value === true;
  } catch {
    return false;
  }
}
