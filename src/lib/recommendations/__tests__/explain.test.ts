import { describe, expect, it } from "vitest";
import { buildReasonDetail, type ExplainableTitle } from "../explain";

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
      hasCollaborativeEdge: false,
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
      hasCollaborativeEdge: false,
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
      hasCollaborativeEdge: false,
      citedTitles: [],
    });
    expect(detail.headline).toContain("Matches your taste closely");
  });

  it("uses the collaborative line when there's no content match but a collaborative edge", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: true,
      citedTitles: [],
    });
    expect(detail.headline).toContain("Loved by people");
  });

  it("falls back to mood tags when neither content nor collaborative signal is present", () => {
    const detail = buildReasonDetail({
      title: title({ mood_tags: ["cozy", "nostalgic"] }),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: false,
      citedTitles: [],
    });
    expect(detail.headline).toContain("cozy");
  });

  it("falls back to a generic Taste Graph line with no signal at all", () => {
    const detail = buildReasonDetail({
      title: title({ mood_tags: [] }),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: false,
      citedTitles: [],
    });
    expect(detail.headline).toContain("Taste Graph");
  });

  it("appends a context note in parens when a context is supplied", () => {
    const detail = buildReasonDetail({
      title: title({ runtime_minutes: 87 }),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: false,
      citedTitles: [],
      context: "something_short",
    });
    expect(detail.headline).toContain("87 minutes");
  });

  it("builds a longer, multi-sentence longReason that names the cited title and themes", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      hasCollaborativeEdge: false,
      citedTitles: ["Se7en"],
    });
    expect(detail.longReason).toContain("Se7en");
    expect(detail.longReason).toContain("betrayal");
    expect(detail.longReason.split(". ").length).toBeGreaterThan(1);
  });

  it("builds a distinct, honest longReason for the behavioral-collaborative branch (no fabricated citation)", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: false,
      hasBehavioralEdge: true,
      citedTitles: [],
    });
    expect(detail.longReason).toContain("ratings data");
    expect(detail.longReason).not.toContain("undefined");
  });

  it("always surfaces the full theme/tone/mood/pacing/ending detail regardless of headline branch", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      hasCollaborativeEdge: false,
      citedTitles: ["Se7en"],
    });
    expect(detail.themes).toEqual(["betrayal", "redemption"]);
    expect(detail.tone).toEqual(["dark", "tense"]);
    expect(detail.moodTags).toEqual(["gritty", "suspenseful"]);
    expect(detail.pacing).toBe("moderate");
    expect(detail.endingType).toBe("bittersweet");
  });
});
