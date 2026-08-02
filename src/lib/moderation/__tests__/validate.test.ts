import { describe, it, expect } from "vitest";
import { validateReport, MAX_REPORT_NOTE_LENGTH } from "@/lib/moderation/validate";

describe("validateReport", () => {
  it("rejects a reason outside the fixed list", () => {
    const result = validateReport("made_up_reason", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reason/i);
  });

  it("accepts a valid reason with no note", () => {
    const result = validateReport("spam", "");
    expect(result).toEqual({ ok: true, reason: "spam", note: null });
  });

  it("trims whitespace-only notes down to null", () => {
    const result = validateReport("harassment", "   ");
    expect(result).toEqual({ ok: true, reason: "harassment", note: null });
  });

  it("keeps a real note", () => {
    const result = validateReport("other", "This user has been sending threats.");
    expect(result).toEqual({ ok: true, reason: "other", note: "This user has been sending threats." });
  });

  it(`rejects a note longer than ${MAX_REPORT_NOTE_LENGTH} characters`, () => {
    const longNote = "x".repeat(MAX_REPORT_NOTE_LENGTH + 1);
    const result = validateReport("spam", longNote);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/limited to/i);
  });

  it(`accepts a note exactly at the ${MAX_REPORT_NOTE_LENGTH}-character limit`, () => {
    const note = "x".repeat(MAX_REPORT_NOTE_LENGTH);
    const result = validateReport("spam", note);
    expect(result).toEqual({ ok: true, reason: "spam", note });
  });
});
