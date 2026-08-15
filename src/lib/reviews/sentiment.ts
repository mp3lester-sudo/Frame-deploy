import { getOpenAI, CHAT_MODEL } from "@/lib/ai/openai";

/**
 * Reviews have zero dependency on ratings (writeReview, social.ts) -- a
 * user can write a full review of a title they never star-rated, and
 * until now that review was pure display copy with no taste signal at
 * all. This estimates a 0.5-5.0 rating-equivalent score from the review
 * text so the recommendation engine's taste vector (see migration 0075's
 * `reviewed` CTE) can use it exactly like a real rating -- but only for
 * titles with no real rating already on file (see writeReview).
 */
const SYSTEM_PROMPT = `You estimate how much a viewer liked a title based on
their written review, on the same 0.5-5.0 scale this app's star ratings use
(0.5 = hated it, 2.5 = mixed/neutral, 5.0 = loved it). Judge the review's own
sentiment, not the title's general reputation. Respond with strict JSON:
{"score": number}`;

/** Clamp to the app's rating range and round to the nearest half-star --
 *  the same granularity real ratings use -- so an inferred score can
 *  never sit somewhere a real rating couldn't (e.g. an out-of-range
 *  value, or a nonsensical decimal, if the model ever drifts from the
 *  requested format). Pure and separately tested from the network call
 *  below, same split as the rest of this codebase's AI-adjacent modules
 *  (e.g. clampInferredScore mirrors buildEmbeddingInput/inferTasteMetadata
 *  keeping parsing logic testable without hitting OpenAI in a test run). */
export function clampInferredScore(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const clamped = Math.max(0.5, Math.min(5.0, raw));
  return Math.round(clamped * 2) / 2;
}

/**
 * Never throws -- a failed or malformed sentiment call should never block
 * posting a review (see writeReview, which fires this as a non-blocking
 * background step after the review itself is already saved). Returns
 * null on any failure, which the `reviewed` CTE above already treats as
 * "no contribution," same as a review that was never scored at all.
 */
export async function inferReviewSentimentScore(reviewBody: string): Promise<number | null> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: reviewBody },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    return clampInferredScore(Number(parsed.score));
  } catch {
    return null;
  }
}
