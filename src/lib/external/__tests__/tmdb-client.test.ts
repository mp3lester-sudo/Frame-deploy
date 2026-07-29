import { describe, it, expect } from "vitest";
import { tmdbImageAtSize } from "@/lib/external/tmdb-client";

describe("tmdbImageAtSize", () => {
  it("swaps the size segment on a stored w185 URL", () => {
    expect(tmdbImageAtSize("https://image.tmdb.org/t/p/w185/abc123.jpg", "h632")).toBe(
      "https://image.tmdb.org/t/p/h632/abc123.jpg"
    );
  });

  it("returns null for a null input", () => {
    expect(tmdbImageAtSize(null, "h632")).toBeNull();
  });

  it("returns the url unchanged if it doesn't match the expected TMDB size pattern", () => {
    const weird = "https://example.com/some-other-image.jpg";
    expect(tmdbImageAtSize(weird, "h632")).toBe(weird);
  });

  it("works for any source size, not just w185", () => {
    expect(tmdbImageAtSize("https://image.tmdb.org/t/p/w500/xyz.jpg", "original")).toBe(
      "https://image.tmdb.org/t/p/original/xyz.jpg"
    );
  });
});
