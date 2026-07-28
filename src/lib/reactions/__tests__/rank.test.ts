import { describe, it, expect } from "vitest";
import { rankByControversy } from "@/lib/reactions/rank";

describe("rankByControversy", () => {
  it("ranks reviews by hot_take + disagree count, highest first", () => {
    const reviewIds = ["quiet", "spicy", "medium"];
    const rows = [
      { review_id: "spicy", reaction: "hot_take", user_id: "u1" },
      { review_id: "spicy", reaction: "hot_take", user_id: "u2" },
      { review_id: "spicy", reaction: "disagree", user_id: "u3" },
      { review_id: "medium", reaction: "disagree", user_id: "u4" },
      { review_id: "quiet", reaction: "agree", user_id: "u5" }, // agree alone doesn't count toward score
    ];
    const ranked = rankByControversy(reviewIds, rows);
    expect(ranked.map((r) => r.reviewId)).toEqual(["spicy", "medium"]);
    expect(ranked[0].score).toBe(3);
    expect(ranked[1].score).toBe(1);
  });

  it("excludes reviews with a zero score entirely", () => {
    const rows = [{ review_id: "r1", reaction: "agree", user_id: "u1" }];
    const ranked = rankByControversy(["r1"], rows);
    expect(ranked).toEqual([]);
  });

  it("ignores reactions on reviews outside the given id set", () => {
    const rows = [{ review_id: "not-in-set", reaction: "hot_take", user_id: "u1" }];
    const ranked = rankByControversy(["r1"], rows);
    expect(ranked).toEqual([]);
  });

  it("ignores unrecognized reaction values", () => {
    const rows = [{ review_id: "r1", reaction: "some_future_reaction", user_id: "u1" }];
    const ranked = rankByControversy(["r1"], rows);
    expect(ranked).toEqual([]);
  });

  it("returns an empty array for no reviews", () => {
    expect(rankByControversy([], [])).toEqual([]);
  });

  it("counts every reaction type in the returned summary, not just the scoring ones", () => {
    const rows = [
      { review_id: "r1", reaction: "hot_take", user_id: "u1" },
      { review_id: "r1", reaction: "need_to_watch", user_id: "u2" },
    ];
    const ranked = rankByControversy(["r1"], rows);
    expect(ranked[0].counts).toEqual({ agree: 0, disagree: 0, hot_take: 1, need_to_watch: 1 });
  });
});
