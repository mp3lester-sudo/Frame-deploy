import { describe, it, expect } from "vitest";
import { tokenizeSearchQuery } from "@/lib/search/tokenize";

describe("tokenizeSearchQuery", () => {
  it("splits on whitespace", () => {
    expect(tokenizeSearchQuery("michael lester")).toEqual(["michael", "lester"]);
  });

  it("collapses repeated whitespace", () => {
    expect(tokenizeSearchQuery("michael   lester")).toEqual(["michael", "lester"]);
  });

  it("trims leading/trailing whitespace", () => {
    expect(tokenizeSearchQuery("  michael  ")).toEqual(["michael"]);
  });

  it("returns an empty array for an empty or whitespace-only query", () => {
    expect(tokenizeSearchQuery("")).toEqual([]);
    expect(tokenizeSearchQuery("   ")).toEqual([]);
  });

  it("returns a single-element array for a single word", () => {
    expect(tokenizeSearchQuery("godfather")).toEqual(["godfather"]);
  });
});
