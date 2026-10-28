// Phase 1 — health check for later monitoring (spec §2: uptime check
// on /api/health). No auth, no database access, no secrets.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "aict-video-showcase" });
}
