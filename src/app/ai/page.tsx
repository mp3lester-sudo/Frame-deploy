import { getAskBacklotPosterWall } from "@/lib/ai/poster-wall";
import { AskBacklotClient } from "@/components/ai/ask-backlot-client";

// Server shell for Ask Backlot -- fetches the poster-wall backdrop
// (lib/ai/poster-wall.ts) so it's already in the initial HTML rather
// than popping in after a client-side fetch, then hands off to the
// actual concierge UI (components/ai/ask-backlot-client.tsx), which owns
// all the interactive state (query, history, reply thread).
export default async function AskBacklotPage() {
  const posters = await getAskBacklotPosterWall();
  return <AskBacklotClient posters={posters} />;
}
