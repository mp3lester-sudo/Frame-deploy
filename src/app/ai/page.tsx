import { getAskSlatePosterWall } from "@/lib/ai/poster-wall";
import { AskSlateClient } from "@/components/ai/ask-slate-client";

// Server shell for Ask Slate -- fetches the poster-wall backdrop
// (lib/ai/poster-wall.ts) so it's already in the initial HTML rather
// than popping in after a client-side fetch, then hands off to the
// actual concierge UI (components/ai/ask-slate-client.tsx), which owns
// all the interactive state (query, history, reply thread).
export default async function AskSlatePage() {
  const posters = await getAskSlatePosterWall();
  return <AskSlateClient posters={posters} />;
}
