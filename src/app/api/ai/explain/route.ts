import { NextResponse } from "next/server";
import { explainTitle } from "@/lib/ai/ending-explainer";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isRateLimited } from "@/lib/rate-limit";
import { z } from "zod";

const bodySchema = z.object({ titleId: z.string().uuid(), question: z.string().min(1).max(300) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to ask about a title" }, { status: 401 });
  }

  if (await isRateLimited(`explain:${user.id}`, { maxRequests: 20, windowSeconds: 600 })) {
    return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "titleId and question are required" }, { status: 400 });
  }

  try {
    const answer = await explainTitle(parsed.data.titleId, parsed.data.question);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[explain]", err);
    return NextResponse.json({ error: "Couldn't answer that right now" }, { status: 500 });
  }
}
