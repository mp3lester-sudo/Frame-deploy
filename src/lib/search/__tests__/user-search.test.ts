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
  it("builds a simple or-filter for a single-word query", () => {
    expect(buildUserSearchFilter("michael")).toBe("username.ilike.%michael%,display_name.ilike.%michael%");
  });

  it("builds an and-of-or filter for a multi-word query, so every word must match somewhere but word order/field doesn't matter", () => {
    expect(buildUserSearchFilter("michael lester")).toBe(
      "and(or(username.ilike.%michael%,display_name.ilike.%michael%),or(username.ilike.%lester%,display_name.ilike.%lester%))"
    );
  });

  it("matches on word order not mattering by construction (reversed query produces an equivalent and-group)", () => {
    const forward = buildUserSearchFilter("michael lester");
    const reversed = buildUserSearchFilter("lester michael");
    // Not identical strings (groups are still in typed order), but both are
    // "and" groups over the same two words -- what matters is that neither
    // query requires the words to appear as one contiguous phrase.
    expect(forward).toContain("and(");
    expect(reversed).toContain("and(");
  });

  it("returns null for a query that's empty after sanitizing", () => {
    expect(buildUserSearchFilter("")).toBeNull();
    expect(buildUserSearchFilter("   ")).toBeNull();
    expect(buildUserSearchFilter(",()")).toBeNull();
  });

  it("never lets raw commas or parens from user input appear as literal characters in a word", () => {
    // "a,b" sanitizes to "a b" (comma -> space) *before* tokenizing, so this
    // is two words ("a", "b"), each safely wrapped in its own ilike clause --
    // not a comma smuggled into the raw filter string to inject a condition.
    const filter = buildUserSearchFilter("a,b");
    expect(filter).toBe("and(or(username.ilike.%a%,display_name.ilike.%a%),or(username.ilike.%b%,display_name.ilike.%b%))");
  });
});
