import { describe, it, expect } from "vitest";
import { extractDiaryFragments, extractDiaryFragmentsFromPages } from "@/lib/import/extract-diary-fragments";
import { parseLetterboxdDiaryPaste } from "@/lib/import/letterboxd-paste";

// Same shape as letterboxd-paste.test.ts's fixture builder.
function diaryRow(opts: { slug: string; title: string; year: number; rating?: string }): string {
  const ratingCell = opts.rating
    ? `<td class="td-rating"><a href="#" title="Remove rating">×</a> ${opts.rating}</td>`
    : `<td class="td-rating"></td>`;
  return `
    <tr class="diary-entry-row">
      <td class="td-film-details">
        <div class="film-poster"><img alt="${opts.title}" src="poster.png"></div>
        <a href="/someuser/film/${opts.slug}/">${opts.title}</a><a href="/films/year/${opts.year}/">${opts.year}</a>
      </td>
      ${ratingCell}
    </tr>`;
}

describe("extractDiaryFragments", () => {
  it("shrinks a page down to just the fragments the server parser needs, and the parser reconstructs the same rows", () => {
    const html = [
      diaryRow({ slug: "the-odyssey-2026", title: "The Odyssey", year: 2026, rating: "★★★★" }),
      diaryRow({ slug: "wet-hot-american-summer", title: "Wet Hot American Summer", year: 2001, rating: "★★★½" }),
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

  it("stays well under Next's default 1MB Server Action body cap even for a large multi-page, padded document", () => {
    // Simulates the realistic worst case that prompted this fix: a saved
    // "Complete Webpage" is mostly boilerplate (nav, inline scripts,
    // analytics padding) around a small number of real entries.
    const padding = "<!-- " + "x".repeat(2000) + " -->\n";
    const bigPage =
      padding.repeat(50) +
      Array.from({ length: 50 }, (_, i) =>
        diaryRow({ slug: `film-${i}`, title: `Film ${i}`, year: 2000 + (i % 25), rating: i % 3 === 0 ? undefined : "★★★★" })
      ).join("\n") +
      padding.repeat(50);

    expect(bigPage.length).toBeGreaterThan(200_000);

    const shrunk = extractDiaryFragmentsFromPages([bigPage, bigPage, bigPage]); // 3 "pages" worth
    expect(shrunk.length).toBeLessThan(1_000_000);
    expect(parseLetterboxdDiaryPaste(shrunk)).toHaveLength(150);
  });
});
