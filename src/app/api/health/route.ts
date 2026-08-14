import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Uptime-monitoring target. Deliberately unauthenticated (health checks
 * need to work with no cookies/session) and deliberately cheap -- a
 * single indexed lookup against a tiny table, not a full dependency
 * fan-out. Returns 200 only if the DB is actually reachable, not just if
 * the Next.js process is alive, since "process is up but DB is down" is
 * exactly the failure mode an uptime check exists to catch.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("titles").select("id").limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      status: "ok",
      db: "reachable",
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        db: "unreachable",
        error: err instanceof Error ? err.message : "unknown error",
      },
      { status: 503 }
    );
  }
}
