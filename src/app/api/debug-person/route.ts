import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tmdbUrl } from "@/lib/external/tmdb-client";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const supabase = await createClient();
  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = tmdbUrl(`/person/${person.tmdb_id}/tagged_images`, { page: "1" });
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  const results: Array<{ image_type?: string; media?: { id?: number; title?: string; name?: string } }> = data.results ?? [];

  const byType: Record<string, number> = {};
  for (const r of results) {
    const t = r.image_type ?? "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }

  return NextResponse.json({
    page: data.page,
    total_pages: data.total_pages,
    total_results: data.total_results,
    resultsOnThisPage: results.length,
    byType,
    sampleNonPoster: results.filter((r) => r.image_type !== "poster").slice(0, 5),
  });
}
