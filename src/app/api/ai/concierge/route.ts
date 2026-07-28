import { NextResponse } from "next/server";
import { askConcierge } from "@/lib/ai/concierge";
import { z } from "zod";

const bodySchema = z.object({ message: z.string().min(1).max(500) });

export async function POST(request: Request) {
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
