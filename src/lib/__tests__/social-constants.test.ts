import { describe, it, expect } from "vitest";
import { REVIEW_REACTIONS, REVIEW_REACTION_LABELS } from "@/lib/constants/social";

describe("review reaction constants", () => {
  it("has a label for every reaction type", () => {
    for (const reaction of REVIEW_REACTIONS) {
      expect(REVIEW_REACTION_LABELS[reaction]).toBeTruthy();
    }
  });
});
