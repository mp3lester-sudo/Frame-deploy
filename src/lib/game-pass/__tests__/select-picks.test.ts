import { describe, expect, it } from "vitest";
import { selectPicks } from "../select-picks";

describe("selectPicks", () => {
  it("takes from the first list before falling back to the next", () => {
    const result = selectPicks([["a", "b"], ["c", "d", "e"]], 4);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("dedupes ids that appear in multiple lists", () => {
    const result = selectPicks([["a", "b"], ["b", "c"]], 3);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("stops once dayCount is reached even if more candidates remain", () => {
    const result = selectPicks([["a", "b", "c", "d"]], 2);
    expect(result).toEqual(["a", "b"]);
  });

  it("returns fewer than dayCount if candidates run out entirely", () => {
    const result = selectPicks([["a"], ["b"]], 5);
    expect(result).toEqual(["a", "b"]);
  });

  it("returns an empty array for empty input", () => {
    expect(selectPicks([], 5)).toEqual([]);
    expect(selectPicks([[]], 5)).toEqual([]);
  });
});
