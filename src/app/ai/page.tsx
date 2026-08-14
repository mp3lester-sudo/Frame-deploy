import { getAskMarqueePosterWall } from "@/lib/ai/poster-wall";
import { AskMarqueeClient } from "@/components/ai/ask-marquee-client";

// Server shell for Ask Marquee -- fetches the poster-wall backdrop
// (lib/ai/poster-wall.ts) so it's already in the initial HTML rather
// than popping in after a client-side fetch, then hands off to the
// actual concierge UI (components/ai/ask-marquee-client.tsx), which owns
// all the interactive state (query, history, reply thread).
export default async function AskMarqueePage() {
  const posters = await getAskMarqueePosterWall();
  return <AskMarqueeClient posters={posters} />;
}
