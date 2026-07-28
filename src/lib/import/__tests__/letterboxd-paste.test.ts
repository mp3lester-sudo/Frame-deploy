import { describe, it, expect } from "vitest";
import { parseLetterboxdDiaryPaste } from "@/lib/import/letterboxd-paste";

// A hand-built approximation of a Letterboxd diary page's row markup —
// modeled on a real page fetched during development (see
// letterboxd-paste.ts's header comment). Each row is a title+year anchor
// pair followed, somewhere in the row's remaining cells, by literal star
// characters for the rating (or nothing, for an unrated watch).
function diaryRow(opts: { slug: string; title: string; year: number; rating?: string }): string {
  const ratingCell = opts.rating
    ? `<td class="td-rating"><a href="#" title="Remove rating">×</a> ${opts.rating}</td>`
    : `<td class="td-rating"></td>`;
  return `
    <tr class="diary-entry-row">
      <td class="td-film-details">
        <div class="film-poster">
          <img alt="${opts.title}" src="poster.png">
        </div>
        <a href="/someuser/film/${opts.slug}/">${opts.title}</a><a href="/films/year/${opts.year}/">${opts.year}</a>
      </td>
      ${ratingCell}
    </tr>`;
}

describe("parseLetterboxdDiaryPaste", () => {
  it("extracts title, year and star rating from real-shaped diary rows", () => {
    const html = [
      diaryRow({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, rating: "★★★★" }),
      diaryRow({ slug: "wet-hot-american-summer", title: "Wet Hot American Summer", year: 2001, rating: "★★★½" }),
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
    const html = diaryRow({ slug: "whats-up-doc-1972", title: "What&#039;s Up, Doc?", year: 1972, rating: "★★★★" });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "What's Up, Doc?", year: 1972, rating: 4 }]);
  });

  it("handles a duplicate-title disambiguation suffix in the film URL (e.g. /tenet/1/)", () => {
    const html = diaryRow({ slug: "tenet/1", title: "Tenet", year: 2020, rating: "★★★★½" });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "Tenet", year: 2020, rating: 4.5 }]);
  });

  it("does not bleed one entry's rating into the next entry", () => {
    const html = [
      diaryRow({ slug: "film-a", title: "Film A", year: 2020 }), // unrated
      diaryRow({ slug: "film-b", title: "Film B", year: 2021, rating: "★★★★★" }),
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
    const html = sidebar + diaryRow({ slug: "jaws", title: "Jaws", year: 1975, rating: "★★★★½" });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "Jaws", year: 1975, rating: 4.5 }]);
  });
});
