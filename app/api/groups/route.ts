// Phase 2 — GET /api/groups (supporting the upload wizard's
// group selection). Returns groups the signed-in user created
// or belongs to. Group creation itself happens inside
// POST /api/projects via group_name; there is no separate
// create-group route in Phase 2. Under placeholder env:
// configured:false, 503.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlaceholderSupabaseEnv } from "@/lib/email";

export async function GET() {
  if (isPlaceholderSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Supabase is not configured yet." },
      { status: 503 },
    );
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);
  const ids = (memberships ?? []).map((m) => (m as { group_id: string }).group_id);
  const { data: created } = await supabase
    .from("groups")
    .select("id, name, created_at")
    .eq("created_by", user.id);
  let memberGroups: unknown[] = [];
  if (ids.length > 0) {
    const { data: grouped } = await supabase
      .from("groups")
      .select("id, name, created_at")
      .in("id", ids);
    memberGroups = grouped ?? [];
  }
  const seen = new Set<string>();
  const groups = [...(created ?? []), ...memberGroups].filter((g) => {
    const id = (g as { id: string }).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return NextResponse.json({ ok: true, groups });
}
