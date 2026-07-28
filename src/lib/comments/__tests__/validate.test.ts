import { describe, it, expect } from "vitest";
import { validateCommentBody, MAX_COMMENT_LENGTH } from "@/lib/comments/validate";

describe("validateCommentBody", () => {
  it("accepts a normal comment", () => {
    expect(validateCommentBody("Great review!")).toEqual({ ok: true, body: "Great review!" });
  });

  it("trims surrounding whitespace", () => {
    expect(validateCommentBody("  nice  ")).toEqual({ ok: true, body: "nice" });
  });

  it("rejects an empty comment", () => {
    const result = validateCommentBody("");
    expect(result.ok).toBe(false);
  });

  it("rejects a comment that's only whitespace", () => {
    const result = validateCommentBody("   \n  ");
    expect(result.ok).toBe(false);
  });

  it(`rejects a comment over ${MAX_COMMENT_LENGTH} characters`, () => {
    const result = validateCommentBody("a".repeat(MAX_COMMENT_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it(`accepts a comment at exactly ${MAX_COMMENT_LENGTH} characters`, () => {
    const body = "a".repeat(MAX_COMMENT_LENGTH);
    expect(validateCommentBody(body)).toEqual({ ok: true, body });
  });
});
