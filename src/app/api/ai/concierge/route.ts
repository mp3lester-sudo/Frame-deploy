import { NextResponse } from "next/server";
import { askConcierge } from "@/lib/ai/concierge";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isRateLimited } from "@/lib/rate-limit";
import { z } from "zod";

const bodySchema = z.object({ message: z.string().min(1).max(500) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the concierge" }, { status: 401 });
  }

  if (await isRateLimited(`concierge:${user.id}`, { maxRequests: 20, windowSeconds: 600 })) {
    return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "A message is required" }, { status: 400 });
  }

  try {
    const result = await askConcierge(parsed.data.message);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[concierge]", err);
    return NextResponse.json({ error: "The concierge is unavailable right now" }, { status: 500 });
  }
}
