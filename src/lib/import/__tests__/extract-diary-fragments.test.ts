import { describe, it, expect } from "vitest";
import { extractDiaryFragments, extractDiaryFragmentsFromPages } from "@/lib/import/extract-diary-fragments";
import { parseLetterboxdDiaryPaste } from "@/lib/import/letterboxd-paste";

// Same shape as letterboxd-paste.test.ts's fixture builder — see that
// file's comment for the real-markup details this models, including the
// hidden 0-10 range input Letterboxd actually uses for ratings.
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

function filmsGridItem(opts: { slug: string; title: string; year: number; ratingValue?: number }): string {
  const ratingSpan =
    opts.ratingValue !== undefined
      ? `<span class="rating -micro -darker rated-${opts.ratingValue}">${"\u2605".repeat(Math.ceil(opts.ratingValue / 2))}</span>`
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

describe("extractDiaryFragments", () => {
  it("shrinks a page down to just the fragments the server parser needs, and the parser reconstructs the same rows", () => {
    const html = [
      diaryRow({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, ratingValue: 8 }),
      diaryRow({ slug: "wet-hot-american-summer", title: "Wet Hot American Summer", year: 2001, ratingValue: 7 }),
      diaryRow({ slug: "goldeneye", title: "GoldenEye", year: 1995 }), // unrated
    ].join("\n");

    const fragments = extractDiaryFragments(html);
    expect(fragments).toHaveLength(3);

    const shrunk = fragments.join("\n");
    // The whole point: shrunk output is a small fraction of the original,
    // discarding all the surrounding nav/poster/table chrome.
    expect(shrunk.length).toBeLessThan(html.length / 2);

    expect(parseLetterboxdDiaryPaste(shrunk)).toEqual(parseLetterboxdDiaryPaste(html));
    expect(parseLetterboxdDiaryPaste(shrunk)).toEqual([
      { name: "The Odyssey", year: 2026, rating: 4 },
      { name: "Wet Hot American Summer", year: 2001, rating: 3.5 },
      { name: "GoldenEye", year: 1995, rating: null },
    ]);
  });

  it("returns nothing for a page with no diary rows", () => {
    expect(extractDiaryFragments("<html><body>nothing here</body></html>")).toEqual([]);
  });

  it("also shrinks a Films/Films>Ratings grid page and reconstructs the same rows", () => {
    const html = [
      filmsGridItem({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, ratingValue: 8 }),
      filmsGridItem({ slug: "birdman", title: "Birdman or (The Unexpected Virtue of Ignorance)", year: 2014, ratingValue: 9 }),
      filmsGridItem({ slug: "goldeneye", title: "GoldenEye", year: 1995 }), // unrated
    ].join("\n");

    const fragments = extractDiaryFragments(html);
    expect(fragments).toHaveLength(3);

    const shrunk = fragments.join("\n");
    expect(shrunk.length).toBeLessThan(html.length / 2);

    expect(parseLetterboxdDiaryPaste(shrunk)).toEqual(parseLetterboxdDiaryPaste(html));
    expect(parseLetterboxdDiaryPaste(shrunk)).toEqual([
      { name: "The Odyssey", year: 2026, rating: 4 },
      { name: "Birdman or (The Unexpected Virtue of Ignorance)", year: 2014, rating: 4.5 },
      { name: "GoldenEye", year: 1995, rating: null },
    ]);
  });

  it("shrinks a combined Diary + Films-grid page (both formats in one document)", () => {
    const html = [
      diaryRow({ slug: "wet-hot-american-summer", title: "Wet Hot American Summer", year: 2001, ratingValue: 7 }),
      filmsGridItem({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, ratingValue: 8 }),
    ].join("\n");

    const fragments = extractDiaryFragments(html);
    expect(fragments).toHaveLength(2);

    const shrunk = fragments.join("\n");
    expect(parseLetterboxdDiaryPaste(shrunk)).toEqual([
      { name: "Wet Hot American Summer", year: 2001, rating: 3.5 },
      { name: "The Odyssey", year: 2026, rating: 4 },
    ]);
  });

  it("stays well under Next's default 1MB Server Action body cap even for a large multi-page, padded document", () => {
    // Simulates the realistic worst case that prompted this fix: a saved
    // "Complete Webpage" is mostly boilerplate (nav, inline scripts,
    // analytics padding) around a small number of real entries.
    const padding = "<!-- " + "x".repeat(2000) + " -->\n";
    const bigPage =
      padding.repeat(50) +
      Array.from({ length: 50 }, (_, i) =>
        diaryRow({ slug: `film-${i}`, title: `Film ${i}`, year: 2000 + (i % 25), ratingValue: i % 3 === 0 ? undefined : 8 })
      ).join("\n") +
      padding.repeat(50);

    expect(bigPage.length).toBeGreaterThan(200_000);

    const shrunk = extractDiaryFragmentsFromPages([bigPage, bigPage, bigPage]); // 3 "pages" worth
    expect(shrunk.length).toBeLessThan(1_000_000);
    expect(parseLetterboxdDiaryPaste(shrunk)).toHaveLength(150);
  });
});
