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
      { name: "The Odyssey", year: 2026, rating: 4, watchedAt: null },
      { name: "Wet Hot American Summer", year: 2001, rating: 3.5, watchedAt: null },
      { name: "GoldenEye", year: 1995, rating: null, watchedAt: null },
    ]);
  });

  it("decodes common HTML entities in titles", () => {
    const html = diaryRow({ slug: "whats-up-doc-1972", title: "What&#039;s Up, Doc?", year: 1972, ratingValue: 8 });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "What's Up, Doc?", year: 1972, rating: 4, watchedAt: null }]);
  });

  it("handles a duplicate-title disambiguation suffix in the film URL (e.g. /tenet/1/)", () => {
    const html = diaryRow({ slug: "tenet/1", title: "Tenet", year: 2020, ratingValue: 9 });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "Tenet", year: 2020, rating: 4.5, watchedAt: null }]);
  });

  it("does not bleed one entry's rating into the next entry", () => {
    const html = [
      diaryRow({ slug: "film-a", title: "Film A", year: 2020 }), // unrated
      diaryRow({ slug: "film-b", title: "Film B", year: 2021, ratingValue: 10 }),
    ].join("\n");
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([
      { name: "Film A", year: 2020, rating: null, watchedAt: null },
      { name: "Film B", year: 2021, rating: 5, watchedAt: null },
    ]);
  });

  it("returns an empty array for a paste that isn't a Letterboxd diary page", () => {
    expect(parseLetterboxdDiaryPaste("<html><body>Not a diary page</body></html>")).toEqual([]);
  });

  it("ignores unrelated year links elsewhere on the page (e.g. decade filter sidebar)", () => {
    const sidebar = `<a href="/someuser/diary/films/decade/1990s/">1990s</a>`;
    const html = sidebar + diaryRow({ slug: "jaws", title: "Jaws", year: 1975, ratingValue: 9 });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "Jaws", year: 1975, rating: 4.5, watchedAt: null }]);
  });
});


// Modeled on real Letterboxd Films/Films>Ratings grid markup (checked
// against a live page and a real "Save Page As" export of
// letterboxd.com/<username>/films/): every poster is a
// `<div class="react-component" data-item-name="Title (YYYY)" ...>` — title
// and year combined, split on the trailing " (YYYY)" — with the rating (if
// any) in a `<span class="rating ... rated-N">` several hundred bytes later
// inside a `<p class="poster-viewingdata">`, not literal star glyphs, and
// entirely absent (empty <p>) for a watched-but-unrated film.
function filmsGridItem(opts: { slug: string; title: string; year: number; ratingValue?: number }): string {
  const ratingSpan =
    opts.ratingValue !== undefined
      ? `<span class="rating -micro -darker rated-${opts.ratingValue}">${"★".repeat(Math.ceil(opts.ratingValue / 2))}</span>`
      : "";
  return `
    <li class="griditem">
      <div class="react-component" data-component-class="LazyPoster" data-item-name="${opts.title} (${opts.year})" data-item-slug="${opts.slug}" data-item-link="/film/${opts.slug}/">
        <div class="poster film-poster">
          <img class="image" alt="Poster for ${opts.title} (${opts.year})"/>
          <span class="frame"><span class="frame-title"></span></span>
        </div>
        <p class="poster-viewingdata" data-item-uid="film:1">${ratingSpan}</p>
      </div>
    </li>`;
}

describe("parseLetterboxdDiaryPaste (Films / Films>Ratings grid page)", () => {
  it("extracts title, year and rating from real-shaped Films grid items", () => {
    const html = [
      filmsGridItem({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, ratingValue: 10 }),
      filmsGridItem({ slug: "him-2025", title: "HIM", year: 2025, ratingValue: 4 }),
      filmsGridItem({ slug: "smile", title: "Smile", year: 2022 }), // watched, unrated
    ].join("\n");

    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([
      { name: "The Odyssey", year: 2026, rating: 5, watchedAt: null },
      { name: "HIM", year: 2025, rating: 2, watchedAt: null },
      { name: "Smile", year: 2022, rating: null, watchedAt: null },
    ]);
  });

  it("splits the trailing (YYYY) even when the title itself contains parentheses", () => {
    const html = filmsGridItem({
      slug: "birdman-or-the-unexpected-virtue-of-ignorance",
      title: "Birdman or (The Unexpected Virtue of Ignorance)",
      year: 2014,
      ratingValue: 8,
    });
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([{ name: "Birdman or (The Unexpected Virtue of Ignorance)", year: 2014, rating: 4, watchedAt: null }]);
  });

  it("does not bleed one item's rating into the next", () => {
    const html = [
      filmsGridItem({ slug: "film-a", title: "Film A", year: 2020 }), // unrated
      filmsGridItem({ slug: "film-b", title: "Film B", year: 2021, ratingValue: 10 }),
    ].join("\n");
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([
      { name: "Film A", year: 2020, rating: null, watchedAt: null },
      { name: "Film B", year: 2021, rating: 5, watchedAt: null },
    ]);
  });

  it("combines Diary rows and Films-grid items pasted together in one blob", () => {
    const html = [
      diaryRow({ slug: "the-departed", title: "The Departed", year: 2006, ratingValue: 10 }),
      filmsGridItem({ slug: "smile", title: "Smile", year: 2022, ratingValue: 6 }),
    ].join("\n");
    const rows = parseLetterboxdDiaryPaste(html);
    expect(rows).toEqual([
      { name: "The Departed", year: 2006, rating: 5, watchedAt: null },
      { name: "Smile", year: 2022, rating: 3, watchedAt: null },
    ]);
  });
});
