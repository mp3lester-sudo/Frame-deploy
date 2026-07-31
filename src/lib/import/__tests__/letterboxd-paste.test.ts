import { describe, it, expect } from "vitest";
import { parseLetterboxdDiaryPaste } from "@/lib/import/letterboxd-paste";

// Modeled on real Letterboxd diary markup (checked against a live diary
// page, and against a real "Save Page As" export): the poster is wrapped
// in its own <a class="frame"> pointing at the same /film/slug/ URL but
// containing only an <img> (no text, so it never matches TITLE_PATTERN's
// `>([^<]+)<` requirement); the real title text lives in a separate anchor
// inside <h2 class="primaryname">; the year is a sibling
// <span class="releasedate"> — NOT immediately adjacent to the title
// anchor's closing tag; and the rating is a hidden 0-10 range input
// (`<input class="rateit-field ..." type="range" min="0" max="10" step="1"
// value="N">`) rendered by a JS star-widget, not literal star glyphs —
// value is double the public star rating (7 = 3.5 stars, 10 = 5 stars).
function diaryRow(opts: { slug: string; title: string; year: number; ratingValue?: number }): string {
  const ratingCell =
    opts.ratingValue !== undefined
      ? `<td class="col-rating -padding-inline-large"><div class="rating-green"><div class="editable-rating shown-for-owner"><a href="#" title="Remove rating">×</a><input class="rateit-field diary-rating-1" type="range" min="0" max="10" step="1" value="${opts.ratingValue}" style="display: none;"><div class="rateit js-rateit instant-rating"></div></div></div></td>`
      : `<td class="col-rating -padding-inline-large"></td>`;
  return `
    <tr class="diary-entry-row">
      <td class="col-production js-td-production">
        <div class="poster film-poster">
          <a class="frame" href="/someuser/film/${opts.slug}/"><img alt="${opts.title}" src="poster.png"></a>
        </div>
        <h2 class="primaryname prettify">
          <a href="/someuser/film/${opts.slug}/">${opts.title}</a>
        </h2>
        <span class="releasedate">
          <a href="/films/year/${opts.year}/">${opts.year}</a>
        </span>
      </td>
      ${ratingCell}
    </tr>`;
}

describe("parseLetterboxdDiaryPaste", () => {
  it("extracts title, year and rating (from the hidden rateit range input) from real-shaped diary rows", () => {
    const html = [
      diaryRow({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, ratingValue: 8 }),
      diaryRow({ slug: "wet-hot-american-summer", title: "Wet Hot American Summer", year: 2001, ratingValue: 7 }),
      diaryRow({ slug: "goldeneye", title: "GoldenEye", year: 1995 }), // watched, unrated
    ].join("\n");

    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([
      { name: "The Odyssey", year: 2026, rating: 4 },
      { name: "Wet Hot American Summer", year: 2001, rating: 3.5 },
      { name: "GoldenEye", year: 1995, rating: null },
    ]);
  });

  it("decodes common HTML entities in titles", () => {
    const html = diaryRow({ slug: "whats-up-doc-1972", title: "What&#039;s Up, Doc?", year: 1972, ratingValue: 8 });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "What's Up, Doc?", year: 1972, rating: 4 }]);
  });

  it("handles a duplicate-title disambiguation suffix in the film URL (e.g. /tenet/1/)", () => {
    const html = diaryRow({ slug: "tenet/1", title: "Tenet", year: 2020, ratingValue: 9 });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "Tenet", year: 2020, rating: 4.5 }]);
  });

  it("does not bleed one entry's rating into the next entry", () => {
    const html = [
      diaryRow({ slug: "film-a", title: "Film A", year: 2020 }), // unrated
      diaryRow({ slug: "film-b", title: "Film B", year: 2021, ratingValue: 10 }),
    ].join("\n");
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([
      { name: "Film A", year: 2020, rating: null },
      { name: "Film B", year: 2021, rating: 5 },
    ]);
  });

  it("returns an empty array for a paste that isn't a Letterboxd diary page", () => {
    expect(parseLetterboxdDiaryPaste("<html><body>Not a diary page</body></html>")).toEqual([]);
  });

  it("ignores unrelated year links elsewhere on the page (e.g. decade filter sidebar)", () => {
    const sidebar = `<a href="/someuser/diary/films/decade/1990s/">1990s</a>`;
    const html = sidebar + diaryRow({ slug: "jaws", title: "Jaws", year: 1975, ratingValue: 9 });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "Jaws", year: 1975, rating: 4.5 }]);
  });
});
