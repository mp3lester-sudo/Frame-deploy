import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

// The SDK's own default (no timeout set) is ~10 minutes -- fine for a
// batch script, not for a request-serving path where every caller
// (askConcierge, explain.ts, review sentiment inference) already expects
// a response within a few seconds. 15s is well above any normal
// embedding or gpt-4.1-mini completion (typically 1-4s), but stops a
// genuinely hung upstream call from holding a Vercel function open until
// the platform's own execution-duration limit kills it -- a real,
// distinct failure mode ("the whole function got killed with no useful
// error") that this turns into a normal, catchable timeout instead.
const OPENAI_CLIENT_TIMEOUT_MS = 15_000;

/** Singleton OpenAI client. Server-only — never import into a Client Component. */
export function getOpenAI() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: OPENAI_CLIENT_TIMEOUT_MS });
  }
  return client;
}

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4.1-mini";
