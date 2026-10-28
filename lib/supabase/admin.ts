// Service-role Supabase client (Phase 1, server only).
// Returns null when no real service key is configured, so route
// handlers can degrade gracefully instead of crashing on placeholders.
// NEVER import this file from a client component.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (
    !url ||
    !serviceKey ||
    url.includes("PLACEHOLDER") ||
    serviceKey.includes("PLACEHOLDER")
  ) {
    return null;
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
