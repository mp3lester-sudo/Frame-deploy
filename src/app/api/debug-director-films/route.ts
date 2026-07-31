import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const personId = searchParams.get("personId") ?? "0ddcda80-431a-44ee-b84a-1a51a113c408";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("title_credits")
    .select("titles(id, name, poster_url, popularity)")
    .eq("person_id", personId)
    .eq("credit_type", "director");
  return NextResponse.json({ count: data?.length ?? 0, error, data });
}
