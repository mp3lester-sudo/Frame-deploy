import { describe, it, expect } from "vitest";
import { findCompanyMatch } from "@/lib/search/company-search";

describe("findCompanyMatch", () => {
  it("matches a known studio name case-insensitively", () => {
    expect(findCompanyMatch("a24")).toEqual({ id: 41077, name: "A24" });
    expect(findCompanyMatch("A24")).toEqual({ id: 41077, name: "A24" });
    expect(findCompanyMatch("  A24  ")).toEqual({ id: 41077, name: "A24" });
  });

  it("matches common aliases to the same id", () => {
    expect(findCompanyMatch("Warner Bros")).toEqual({ id: 174, name: "Warner Bros. Pictures" });
    expect(findCompanyMatch("warner brothers")).toEqual({ id: 174, name: "Warner Bros. Pictures" });
  });

  it("returns null for an unrecognized query", () => {
    expect(findCompanyMatch("The Godfather")).toBeNull();
  });

  it("returns null for an empty or whitespace-only query", () => {
    expect(findCompanyMatch("")).toBeNull();
    expect(findCompanyMatch("   ")).toBeNull();
  });

  it("does not partial-match a substring of a known name", () => {
    // "a24 films" is not itself a recognized key -- guards against a
    // fuzzy/substring match silently replacing an unrelated title search.
    expect(findCompanyMatch("a24 films")).toBeNull();
  });
});
