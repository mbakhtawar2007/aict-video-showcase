// Server Supabase client (Phase 1, App Router). Cookie handling follows
// the @supabase/ssr Next.js pattern. Service-role access is separate
// (lib/supabase/admin.ts) and is only used server-side, never in the
// browser, and only when a real service key is configured.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from Server Components, where setting
            // cookies is not allowed; middleware refreshes the session.
          }
        },
      },
    },
  );
}
