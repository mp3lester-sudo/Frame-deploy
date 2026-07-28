import { describe, it, expect } from "vitest";
import { validateMessageBody, MAX_MESSAGE_LENGTH } from "@/lib/messages/validate";

describe("validateMessageBody", () => {
  it("accepts a normal message", () => {
    expect(validateMessageBody("Hey, loved your review!")).toEqual({ ok: true, body: "Hey, loved your review!" });
  });
  it("trims whitespace", () => {
    expect(validateMessageBody("  hi  ")).toEqual({ ok: true, body: "hi" });
  });
  it("rejects an empty message", () => {
    expect(validateMessageBody("").ok).toBe(false);
  });
  it("rejects a whitespace-only message", () => {
    expect(validateMessageBody("   ").ok).toBe(false);
  });
  it(`rejects a message over ${MAX_MESSAGE_LENGTH} characters`, () => {
    expect(validateMessageBody("a".repeat(MAX_MESSAGE_LENGTH + 1)).ok).toBe(false);
  });
});
