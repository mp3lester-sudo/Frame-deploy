import { describe, it, expect } from "vitest";
import { computeMatches, rankByLikeCount } from "@/lib/recommendations/movie-night-matches";

describe("computeMatches", () => {
  it("returns a match when every participant liked the same title", () => {
    const matches = computeMatches(
      ["a", "b"],
      [
        { user_id: "a", title_id: "t1", vote: "like" },
        { user_id: "b", title_id: "t1", vote: "like" },
      ]
    );
    expect(matches).toEqual([{ titleId: "t1", likedBy: expect.arrayContaining(["a", "b"]) }]);
  });

  it("is not a match if only some participants have liked it", () => {
    const matches = computeMatches(
      ["a", "b"],
      [{ user_id: "a", title_id: "t1", vote: "like" }]
    );
    expect(matches).toEqual([]);
  });

  it("a single pass permanently disqualifies a title, even with everyone else's like", () => {
    const matches = computeMatches(
      ["a", "b"],
      [
        { user_id: "a", title_id: "t1", vote: "like" },
        { user_id: "b", title_id: "t1", vote: "pass" },
      ]
    );
    expect(matches).toEqual([]);
  });

  it("supports groups larger than two", () => {
    const matches = computeMatches(
      ["a", "b", "c"],
      [
        { user_id: "a", title_id: "t1", vote: "like" },
        { user_id: "b", title_id: "t1", vote: "like" },
        { user_id: "c", title_id: "t1", vote: "like" },
      ]
    );
    expect(matches).toHaveLength(1);
  });

  it("finds multiple independent matches", () => {
    const matches = computeMatches(
      ["a", "b"],
      [
        { user_id: "a", title_id: "t1", vote: "like" },
        { user_id: "b", title_id: "t1", vote: "like" },
        { user_id: "a", title_id: "t2", vote: "like" },
        { user_id: "b", title_id: "t2", vote: "like" },
      ]
    );
    expect(matches.map((m) => m.titleId).sort()).toEqual(["t1", "t2"]);
  });

  it("ignores votes from users no longer in the group", () => {
    const matches = computeMatches(
      ["a", "b"],
      [
        { user_id: "a", title_id: "t1", vote: "like" },
        { user_id: "b", title_id: "t1", vote: "like" },
        { user_id: "removed-user", title_id: "t1", vote: "pass" },
      ]
    );
    expect(matches).toEqual([{ titleId: "t1", likedBy: expect.arrayContaining(["a", "b"]) }]);
  });

  it("returns nothing for an empty participant list", () => {
    expect(computeMatches([], [{ user_id: "a", title_id: "t1", vote: "like" }])).toEqual([]);
  });
});

describe("rankByLikeCount", () => {
  it("ranks titles by how many people liked them, most first", () => {
    const ranked = rankByLikeCount([
      { user_id: "a", title_id: "t1", vote: "like" },
      { user_id: "b", title_id: "t1", vote: "like" },
      { user_id: "a", title_id: "t2", vote: "like" },
    ]);
    expect(ranked).toEqual([
      { titleId: "t1", likeCount: 2 },
      { titleId: "t2", likeCount: 1 },
    ]);
  });

  it("excludes anything anyone passed on, even if others liked it", () => {
    const ranked = rankByLikeCount([
      { user_id: "a", title_id: "t1", vote: "like" },
      { user_id: "b", title_id: "t1", vote: "pass" },
    ]);
    expect(ranked).toEqual([]);
  });

  it("returns an empty list when there are no votes", () => {
    expect(rankByLikeCount([])).toEqual([]);
  });
});
