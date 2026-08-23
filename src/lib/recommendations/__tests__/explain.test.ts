import { describe, expect, it } from "vitest";
import { buildReasonDetail, buildExplorationDetail, type ExplainableTitle } from "../explain";

function title(overrides: Partial<ExplainableTitle> = {}): ExplainableTitle {
  return {
    runtime_minutes: 110,
    violence_level: 1,
    comedy_level: 1,
    emotional_intensity: 2,
    dialogue_density: 2,
    pacing: "moderate",
    themes: ["betrayal", "redemption"],
    tone: ["dark", "tense"],
    mood_tags: ["gritty", "suspenseful"],
    ending_type: "bittersweet",
    ...overrides,
  };
}

describe("buildReasonDetail", () => {
  it("cites the source title and its traits when there's a strong content match with one citation", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      citedTitles: ["Se7en"],
    });
    expect(detail.headline).toContain("Se7en");
    expect(detail.headline).toContain("betrayal");
    expect(detail.citedTitles).toEqual(["Se7en"]);
  });

  it("cites both titles, without trait clutter, when there are two citations", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      citedTitles: ["Se7en", "Zodiac"],
    });
    expect(detail.headline).toContain("Se7en");
    expect(detail.headline).toContain("Zodiac");
    expect(detail.headline).toContain("and");
    expect(detail.citedTitles).toEqual(["Se7en", "Zodiac"]);
  });

  it("falls back to a generic content-match line when there's no citation", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      citedTitles: [],
    });
    expect(detail.headline).toContain("Matches your taste closely");
  });

  it("falls back to mood tags when there's no content match", () => {
    const detail = buildReasonDetail({
      title: title({ mood_tags: ["cozy", "nostalgic"] }),
      hasStrongContentMatch: false,
      citedTitles: [],
    });
    expect(detail.headline).toContain("cozy");
  });

  it("falls back to a generic Taste Graph line with no signal at all", () => {
    const detail = buildReasonDetail({
      title: title({ mood_tags: [] }),
      hasStrongContentMatch: false,
      citedTitles: [],
    });
    expect(detail.headline).toContain("Taste Graph");
  });

  it("never surfaces a collaborative-filtering / 'other people' headline -- content-only by design", () => {
    // Regression guard: recommendations must only ever be explainable by
    // this user's own curated ratings, never "people whose taste overlaps
    // with yours" or similar crowd-sourced framing.
    const strong = buildReasonDetail({ title: title(), hasStrongContentMatch: true, citedTitles: [] });
    const mood = buildReasonDetail({ title: title(), hasStrongContentMatch: false, citedTitles: [] });
    const generic = buildReasonDetail({ title: title({ mood_tags: [] }), hasStrongContentMatch: false, citedTitles: [] });
    for (const detail of [strong, mood, generic]) {
      expect(detail.headline.toLowerCase()).not.toContain("loved by people");
      expect(detail.headline.toLowerCase()).not.toContain("other users");
      expect(detail.headline.toLowerCase()).not.toContain("other viewers");
      expect(detail.longReason.toLowerCase()).not.toContain("loved by people");
      expect(detail.longReason.toLowerCase()).not.toContain("other users");
      expect(detail.longReason.toLowerCase()).not.toContain("other viewers");
    }
  });

  it("appends a context note in parens when a context is supplied", () => {
    const detail = buildReasonDetail({
      title: title({ runtime_minutes: 87 }),
      hasStrongContentMatch: false,
      citedTitles: [],
      context: "something_short",
    });
    expect(detail.headline).toContain("87 minutes");
  });

  it("builds a longer, multi-sentence longReason that names the cited title and themes", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      citedTitles: ["Se7en"],
    });
    expect(detail.longReason).toContain("Se7en");
    expect(detail.longReason).toContain("betrayal");
    expect(detail.longReason.split(". ").length).toBeGreaterThan(1);
  });

  it("always surfaces the full theme/tone/mood/pacing/ending detail regardless of headline branch", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      citedTitles: ["Se7en"],
    });
    expect(detail.themes).toEqual(["betrayal", "redemption"]);
    expect(detail.tone).toEqual(["dark", "tense"]);
    expect(detail.moodTags).toEqual(["gritty", "suspenseful"]);
    expect(detail.pacing).toBe("moderate");
    expect(detail.endingType).toBe("bittersweet");
  });
});

// Recommendation intelligence audit finding #2: the labeling half of the
// exploration slot -- this must never read like a normal top match.
describe("buildExplorationDetail", () => {
  it("headline names the user's usual genres and does not claim a taste match", () => {
    const detail = buildExplorationDetail(title({ genres: ["Comedy"] }), ["Drama", "Thriller"]);
    expect(detail.headline).toContain("Something different");
    expect(detail.headline).toContain("Drama");
    expect(detail.headline).not.toContain("Because you loved");
    expect(detail.headline).not.toContain("Matches your taste");
  });

  it("longReason explicitly frames this as a change of pace, not a match", () => {
    const detail = buildExplorationDetail(title({ genres: ["Comedy"] }), ["Drama"]);
    expect(detail.longReason).toContain("change of pace");
    expect(detail.longReason).toContain("Drama");
  });

  it("still surfaces the title's real themes/tone/mood/pacing detail", () => {
    const detail = buildExplorationDetail(title({ genres: ["Comedy"] }), ["Drama"]);
    expect(detail.themes).toEqual(["betrayal", "redemption"]);
    expect(detail.tone).toEqual(["dark", "tense"]);
    expect(detail.pacing).toBe("moderate");
  });

  it("never fabricates a citation -- exploration picks are not close matches by definition", () => {
    const detail = buildExplorationDetail(title({ genres: ["Comedy"] }), ["Drama"]);
    expect(detail.citedTitles).toEqual([]);
  });

  it("still produces an honest headline even with no known usual genres", () => {
    const detail = buildExplorationDetail(title({ genres: ["Comedy"] }), []);
    expect(detail.headline).toContain("Something different");
    expect(detail.headline).not.toContain("undefined");
  });
});
