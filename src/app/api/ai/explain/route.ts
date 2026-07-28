import { NextResponse } from "next/server";
import { explainTitle } from "@/lib/ai/ending-explainer";
import { z } from "zod";

const bodySchema = z.object({ titleId: z.string().uuid(), question: z.string().min(1).max(300) });

export async function POST(request: Request) {
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
