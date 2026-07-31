import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tmdbUrl } from "@/lib/external/tmdb-client";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const supabase = await createClient();
  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = tmdbUrl(`/person/${person.tmdb_id}/tagged_images`);
  const res = await fetch(url, { cache: "no-store" });
  const status = res.status;
  const text = await res.text();

  return NextResponse.json({
    personTmdbId: person.tmdb_id,
    urlUsed: url.replace(/api_key=[^&]+/, "api_key=REDACTED"),
    status,
    bodyPreview: text.slice(0, 2000),
  });
}
