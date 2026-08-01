import { createServiceRoleClient } from "@/lib/supabase/server";
import { getOpenAI, CHAT_MODEL } from "@/lib/ai/openai";
import { POSTER_FONT_NAMES } from "@/lib/poster-font/fonts";

/**
 * No API surfaces "the font used on a movie poster" as data — this infers
 * one. A vision-capable OpenAI call looks at the poster's title-lettering
 * treatment and picks the single closest match from POSTER_FONT_NAMES (a
 * fixed, pre-loaded set — see fonts.ts for why it's constrained rather than
 * open-ended). Same lazy-fetch-on-view-then-cache-forever pattern as RT
 * scores (src/lib/external/rotten-tomatoes.ts): first page view for a given
 * title triggers the lookup, the pick (or a confirmed "no good match") is
 * cached on titles.poster_font / poster_font_checked_at, every view after
 * that is a free DB read.
 */

export interface PosterFontLookupInput {
  id: string;
  poster_url: string | null;
  poster_font: string | null;
  poster_font_checked_at: string | null;
}

export async function getOrFetchPosterFont(title: PosterFontLookupInput): Promise<string | null> {
  // Already checked (hit or confirmed no match) — serve from cache.
  if (title.poster_font_checked_at) return title.poster_font;

  if (!title.poster_url) return null; // nothing to look at; leave uncached in case a poster shows up later

  let pick: string | null = null;

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: `You match movie poster title-lettering to the closest font from a fixed list. Respond with ONLY one exact name from this list, nothing else: ${POSTER_FONT_NAMES.join(", ")}. If none of them are even a loose match, respond with "none".`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Which font from the list most closely matches this poster's title lettering?" },
            { type: "image_url", image_url: { url: title.poster_url } },
          ],
        },
      ],
      max_tokens: 20,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    pick = POSTER_FONT_NAMES.includes(raw) ? raw : null; // reject anything the model hallucinated outside the list
  } catch {
    // Vision call failed/timed out — don't cache a miss, just retry next view.
    return null;
  }

  const supabase = createServiceRoleClient();
  await supabase
    .from("titles")
    .update({ poster_font: pick, poster_font_checked_at: new Date().toISOString() })
    .eq("id", title.id);

  return pick;
}
