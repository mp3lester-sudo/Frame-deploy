export const MAX_MESSAGE_LENGTH = 4000;

export type MessageValidation = { ok: true; body: string } | { ok: false; error: string };

export function validateMessageBody(raw: string): MessageValidation {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Message can't be empty" };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters` };
  }
  return { ok: true, body };
}
