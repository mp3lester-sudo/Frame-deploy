export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate_speech",
  "sexual_content",
  "spoilers",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment or bullying",
  hate_speech: "Hate speech",
  sexual_content: "Sexual content",
  spoilers: "Unmarked spoilers",
  other: "Something else",
};

export const REPORTABLE_CONTENT_TYPES = ["review", "review_comment", "message", "club_post", "profile"] as const;

export type ReportableContentType = (typeof REPORTABLE_CONTENT_TYPES)[number];

export const MAX_REPORT_NOTE_LENGTH = 500;

export type ReportValidation =
  | { ok: true; reason: ReportReason; note: string | null }
  | { ok: false; error: string };

/**
 * Shared validation for a report submission -- used both by the report
 * form (to disable submit / show a live error) and inside the
 * reportContent server action itself, same split as validateCommentBody
 * and validateMessageBody. A report always needs a reason from the fixed
 * list; the note is optional context and capped short since it's meant to
 * add one detail, not a full letter.
 */
export function validateReport(reason: string, rawNote: string): ReportValidation {
  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return { ok: false, error: "Pick a reason for this report" };
  }
  const note = rawNote.trim();
  if (note.length > MAX_REPORT_NOTE_LENGTH) {
    return { ok: false, error: `Notes are limited to ${MAX_REPORT_NOTE_LENGTH} characters (this is ${note.length})` };
  }
  return { ok: true, reason: reason as ReportReason, note: note || null };
}
