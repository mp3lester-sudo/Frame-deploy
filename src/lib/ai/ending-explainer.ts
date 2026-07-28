import { getOpenAI, CHAT_MODEL } from "@/lib/ai/openai";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You explain movie/TV endings and answer in-scene questions
("what did I miss", "who was that actor", "explain the symbolism"). Ground every
answer in the provided title metadata. If the metadata doesn't cover the answer,
say so plainly instead of inventing plot details. Keep answers under 150 words
unless asked for more.`;

export async function explainTitle(titleId: string, question: string): Promise<string> {
  const supabase = await createClient();
  const { data: title } = await supabase.from("titles").select("*").eq("id", titleId).single();
  if (!title) throw new Error("Title not found");

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Title metadata:\n${JSON.stringify({
          name: title.name,
          overview: title.overview,
          themes: title.themes,
          ending_type: title.ending_type,
          tone: title.tone,
        })}\n\nQuestion: ${question}`,
      },
    ],
  });

  return completion.choices[0].message.content ?? "";
}
