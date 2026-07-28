import { describe, it, expect } from "vitest";
import { sanitizeForOrFilter, buildUserSearchFilter } from "@/lib/search/user-search";

describe("sanitizeForOrFilter", () => {
  it("strips commas and parens that would corrupt a PostgREST .or() filter", () => {
    expect(sanitizeForOrFilter("Smith, John")).toBe("Smith  John");
    expect(sanitizeForOrFilter("foo(bar)")).toBe("foo bar");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeForOrFilter("  michael  ")).toBe("michael");
  });
});

describe("buildUserSearchFilter", () => {
  it("builds an or-filter matching username or display_name", () => {
    expect(buildUserSearchFilter("michael")).toBe("username.ilike.%michael%,display_name.ilike.%michael%");
  });

  it("returns null for a query that's empty after sanitizing", () => {
    expect(buildUserSearchFilter("")).toBeNull();
    expect(buildUserSearchFilter("   ")).toBeNull();
    expect(buildUserSearchFilter(",()")).toBeNull();
  });

  it("never lets a raw comma reach the filter string (would inject a second .or() condition)", () => {
    const filter = buildUserSearchFilter("a,b");
    expect(filter).not.toBeNull();
    expect(filter!.split(",").length).toBe(2); // exactly the two intended conditions, not three+
  });
});
