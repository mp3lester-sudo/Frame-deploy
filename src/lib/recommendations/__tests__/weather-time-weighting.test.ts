import { describe, expect, it } from "vitest";
import { weatherTimeMultiplier, weatherTimeNote, type WeatherableTitle } from "../weather-time-weighting";

function title(overrides: Partial<WeatherableTitle> = {}): WeatherableTitle {
  return {
    mood_tags: [],
    tone: [],
    runtime_minutes: 100,
    ...overrides,
  };
}

const RAIN_CODE = 63; // moderate rain
const CLEAR_CODE = 0;

describe("weatherTimeMultiplier", () => {
  it("boosts comfort-tagged titles on rainy or cold days", () => {
    const cozy = title({ mood_tags: ["heartwarming"] });
    expect(weatherTimeMultiplier(cozy, { weatherCode: RAIN_CODE, tempF: 60, hour: 19 })).toBe(1.25);
    expect(weatherTimeMultiplier(cozy, { weatherCode: CLEAR_CODE, tempF: 30, hour: 19 })).toBe(1.25);
  });

  it("doesn't touch non-comfort titles on rainy days", () => {
    const neutral = title({ mood_tags: ["tense"] });
    expect(weatherTimeMultiplier(neutral, { weatherCode: RAIN_CODE, tempF: 60, hour: 19 })).toBe(1);
  });

  it("boosts heavy-toned titles on a stormy midnight (storm-noir)", () => {
    const darkThriller = title({ tone: ["dark", "gritty"], runtime_minutes: 127 }); // e.g. Se7en
    expect(weatherTimeMultiplier(darkThriller, { weatherCode: RAIN_CODE, tempF: 50, hour: 0 })).toBe(1.3);
  });

  it("doesn't apply storm-noir without both rain and late night", () => {
    const darkThriller = title({ tone: ["dark"] });
    // Rain but daytime.
    expect(weatherTimeMultiplier(darkThriller, { weatherCode: RAIN_CODE, tempF: 50, hour: 14 })).toBe(1);
    // Late night but clear.
    expect(weatherTimeMultiplier(darkThriller, { weatherCode: CLEAR_CODE, tempF: 50, hour: 0 })).toBe(1);
  });

  it("doesn't apply storm-noir to non-heavy-toned titles", () => {
    const light = title({ tone: ["uplifting"] });
    expect(weatherTimeMultiplier(light, { weatherCode: RAIN_CODE, tempF: 50, hour: 0 })).toBe(1);
  });

  it("boosts light-toned titles and penalizes heavy-toned ones on a warm clear afternoon", () => {
    expect(
      weatherTimeMultiplier(title({ tone: ["uplifting"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 14 })
    ).toBe(1.2);
    expect(
      weatherTimeMultiplier(title({ tone: ["dark"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 14 })
    ).toBe(0.8);
  });

  it("doesn't apply the warm-day nudge outside daytime hours even if it's warm", () => {
    expect(
      weatherTimeMultiplier(title({ tone: ["uplifting"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 23 })
    ).toBe(1);
  });

  it("penalizes very long runtimes late at night", () => {
    expect(
      weatherTimeMultiplier(title({ runtime_minutes: 170 }), { weatherCode: null, tempF: null, hour: 23 })
    ).toBe(0.85);
    expect(
      weatherTimeMultiplier(title({ runtime_minutes: 170 }), { weatherCode: null, tempF: null, hour: 14 })
    ).toBe(1);
  });

  it("is a no-op when there's no weather/time signal to react to", () => {
    expect(weatherTimeMultiplier(title(), { weatherCode: null, tempF: null, hour: 14 })).toBe(1);
  });

  it("compounds multiple applicable nudges", () => {
    // Cold + late night + long runtime: comfort boost applies, late-night runtime penalty applies too.
    const cozyAndLong = title({ mood_tags: ["nostalgic"], runtime_minutes: 170 });
    expect(weatherTimeMultiplier(cozyAndLong, { weatherCode: null, tempF: 30, hour: 23 })).toBeCloseTo(
      1.25 * 0.85,
      5
    );
  });

  it("compounds storm-noir with the late-night long-runtime penalty", () => {
    // A long, dark, rainy-midnight pick gets pulled two ways at once —
    // both rules are honest about their own trigger and neither cancels
    // the other out.
    const longDarkThriller = title({ tone: ["dark"], runtime_minutes: 170 });
    expect(
      weatherTimeMultiplier(longDarkThriller, { weatherCode: RAIN_CODE, tempF: 50, hour: 0 })
    ).toBeCloseTo(1.3 * 0.85, 5);
  });
});

describe("weatherTimeNote", () => {
  it("explains a rainy-day comfort pick", () => {
    expect(weatherTimeNote(title({ mood_tags: ["warm"] }), { weatherCode: RAIN_CODE, tempF: 60, hour: 19 })).toBe(
      "a comfort watch for the weather outside"
    );
  });

  it("explains a cold-but-clear comfort pick differently from actual rain", () => {
    expect(weatherTimeNote(title({ mood_tags: ["warm"] }), { weatherCode: CLEAR_CODE, tempF: 30, hour: 19 })).toBe(
      "cozy for a cold one"
    );
  });

  it("explains a stormy-midnight dark pick", () => {
    expect(
      weatherTimeNote(title({ tone: ["dark"] }), { weatherCode: RAIN_CODE, tempF: 50, hour: 0 })
    ).toBe("a stormy-night watch, dark to match it");
  });

  it("explains a light pick on a bright day", () => {
    expect(
      weatherTimeNote(title({ tone: ["lighthearted"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 14 })
    ).toBe("light enough for a bright day");
  });

  it("returns null when nothing applies", () => {
    expect(weatherTimeNote(title(), { weatherCode: CLEAR_CODE, tempF: 65, hour: 14 })).toBeNull();
  });
});
