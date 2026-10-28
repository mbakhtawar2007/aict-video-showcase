// Phase 1 — session refresh middleware (@supabase/ssr pattern).
// Refreshes the HTTP-only session cookie on every request so the
// server clients in route handlers see a current session. With
// placeholder env values it passes requests through unchanged;
// any refresh error is swallowed, never turns into a 500.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon || url.includes("PLACEHOLDER") || anon.includes("PLACEHOLDER")) {
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    await supabase.auth.getUser();
  } catch {
    // Placeholder/offline: pass through; route handlers return
    // their own graceful errors.
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
