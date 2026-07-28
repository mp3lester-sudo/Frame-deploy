import { describe, it, expect } from "vitest";
import { aggregateReactions, emptyReactionSummary } from "@/lib/reactions/aggregate";

describe("aggregateReactions", () => {
  it("counts each reaction type per review", () => {
    const rows = [
      { review_id: "r1", reaction: "agree", user_id: "u1" },
      { review_id: "r1", reaction: "agree", user_id: "u2" },
      { review_id: "r1", reaction: "disagree", user_id: "u3" },
      { review_id: "r2", reaction: "hot_take", user_id: "u1" },
    ];
    const result = aggregateReactions(rows, null);
    expect(result.get("r1")!.counts).toEqual({ agree: 2, disagree: 1, hot_take: 0, need_to_watch: 0 });
    expect(result.get("r2")!.counts).toEqual({ agree: 0, disagree: 0, hot_take: 1, need_to_watch: 0 });
  });

  it("identifies the viewer's own reaction", () => {
    const rows = [
      { review_id: "r1", reaction: "agree", user_id: "u1" },
      { review_id: "r1", reaction: "need_to_watch", user_id: "viewer" },
    ];
    const result = aggregateReactions(rows, "viewer");
    expect(result.get("r1")!.myReaction).toBe("need_to_watch");
  });

  it("leaves myReaction null when the viewer hasn't reacted", () => {
    const rows = [{ review_id: "r1", reaction: "agree", user_id: "u1" }];
    const result = aggregateReactions(rows, "viewer");
    expect(result.get("r1")!.myReaction).toBeNull();
  });

  it("leaves myReaction null with no viewer (logged out)", () => {
    const rows = [{ review_id: "r1", reaction: "agree", user_id: "u1" }];
    const result = aggregateReactions(rows, null);
    expect(result.get("r1")!.myReaction).toBeNull();
  });

  it("ignores rows with an unrecognized reaction value rather than throwing", () => {
    const rows = [{ review_id: "r1", reaction: "some_future_reaction", user_id: "u1" }];
    const result = aggregateReactions(rows, null);
    expect(result.has("r1")).toBe(false);
  });

  it("returns an empty map for no rows", () => {
    expect(aggregateReactions([], "viewer").size).toBe(0);
  });
});

describe("emptyReactionSummary", () => {
  it("returns all-zero counts and no reaction", () => {
    expect(emptyReactionSummary()).toEqual({
      counts: { agree: 0, disagree: 0, hot_take: 0, need_to_watch: 0 },
      myReaction: null,
    });
  });
});
