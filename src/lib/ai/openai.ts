import OpenAI from "openai";

let client: OpenAI | null = null;

/** Singleton OpenAI client. Server-only — never import into a Client Component. */
export function getOpenAI() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4.1-mini";
