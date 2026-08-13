import { describe, it, expect } from "vitest";
import { queryMentionsTitle } from "@/lib/ai/title-mention";

describe("queryMentionsTitle", () => {
  it("matches a named title inside a longer request, case-insensitively", () => {
    expect(queryMentionsTitle("movies like Memories of Murder", "Memories of Murder")).toBe(true);
    expect(queryMentionsTitle("movies like memories of murder", "Memories of Murder")).toBe(true);
    expect(queryMentionsTitle("something in the spirit of THE DEPARTED", "The Departed")).toBe(true);
  });

  it("does not match when the title genuinely isn't mentioned", () => {
    expect(queryMentionsTitle("something funny to watch tonight", "Memories of Murder")).toBe(false);
    expect(queryMentionsTitle("a slow-burn psychological thriller", "The Departed")).toBe(false);
  });

  it("requires a word boundary, not a raw substring", () => {
    // "Up" should not match inside "cheer up" or "upside down".
    expect(queryMentionsTitle("something to cheer me up", "Up")).toBe(false);
    expect(queryMentionsTitle("upside down and weird", "Up")).toBe(false);
  });

  it("short titles only match on an exact whole-query equality", () => {
    expect(queryMentionsTitle("It", "It")).toBe(true);
    expect(queryMentionsTitle("it", "It")).toBe(true);
    expect(queryMentionsTitle("  It  ", "It")).toBe(true);
    // "It" appears as a standalone word here but the query isn't *just* "It".
    expect(queryMentionsTitle("I think it was scary", "It")).toBe(false);
    expect(queryMentionsTitle("something like It but funnier", "It")).toBe(false);
  });

  it("longer titles use a real word-boundary match, not exact-query equality", () => {
    expect(queryMentionsTitle("give me something like Her", "Her")).toBe(false); // "Her" is 3 chars, exact-only
    expect(queryMentionsTitle("give me something like Whiplash", "Whiplash")).toBe(true);
  });

  it("escapes regex special characters in the title", () => {
    expect(queryMentionsTitle("something like Se7en", "Se7en")).toBe(true);
    expect(queryMentionsTitle("something like Zack Snyder's Justice League (2021)", "Zack Snyder's Justice League (2021)")).toBe(true);
    expect(() => queryMentionsTitle("what about (Marriage Story)?", "(Marriage Story)")).not.toThrow();
  });

  it("handles empty or whitespace-only names safely", () => {
    expect(queryMentionsTitle("anything", "")).toBe(false);
    expect(queryMentionsTitle("anything", "   ")).toBe(false);
  });
});
