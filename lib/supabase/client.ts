// Browser Supabase client (Phase 1). Uses @supabase/ssr so the session
// lives in HTTP-only cookies set by the server routes, not in
// localStorage. With placeholder env values (see .env.example) this
// client is created but no call will succeed; route handlers check
// for placeholder config first and return a graceful demo response.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
