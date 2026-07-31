import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTmdbTaggedImages } from "@/lib/external/tmdb-person";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const supabase = await createClient();
  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: credits } = await supabase
    .from("title_credits")
    .select("credit_type, character_name, titles(id, name, tmdb_id)")
    .eq("person_id", id);

  const actingCredits = (credits ?? []).filter(
    (c: { credit_type: string; character_name: string | null; titles: unknown }) =>
      c.credit_type === "actor" && c.character_name && (c.titles as { tmdb_id?: number } | null)?.tmdb_id != null
  );

  const taggedImages = person.tmdb_id ? await getTmdbTaggedImages(person.tmdb_id, 50) : [];

  return NextResponse.json({
    personTmdbId: person.tmdb_id,
    actingCreditCount: actingCredits.length,
    actingCreditTmdbIds: actingCredits.map(
      (c: { titles: unknown }) => (c.titles as { tmdb_id?: number; name?: string })
    ),
    taggedImageCount: taggedImages.length,
    taggedImages,
    matches: taggedImages.filter((img) =>
      actingCredits.some((c: { titles: unknown }) => (c.titles as { tmdb_id?: number })?.tmdb_id === img.tmdbTitleId)
    ),
  });
}
