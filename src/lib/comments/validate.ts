export const MAX_COMMENT_LENGTH = 2000;

export type CommentValidation = { ok: true; body: string } | { ok: false; error: string };

/**
 * Shared validation for a comment body — used both client-side (to disable
 * the submit button / show a live error before round-tripping to the
 * server) and inside the addComment server action itself, since a server
 * action must never trust that the client actually enforced its own rules.
 */
export function validateCommentBody(raw: string): CommentValidation {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Comment can't be empty" };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters (this is ${body.length})` };
  }
  return { ok: true, body };
}
