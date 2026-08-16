import { describe, it, expect } from "vitest";
import { parseLetterboxdRss, hasWrittenReview } from "@/lib/import/letterboxd-rss";

const POSTER = `<p><img src="https://a.ltrbxd.com/resized/poster.jpg"/></p>`;

function reviewItem(opts: {
  filmTitle: string;
  filmYear?: number;
  memberRating?: number;
  watchedDate?: string;
  tmdbMovieId?: number;
  reviewHtml?: string;
}): string {
  return `
    <item>
      <title>${opts.filmTitle}, ${opts.filmYear ?? ""}</title>
      <link>https://letterboxd.com/someuser/film/${opts.filmTitle.toLowerCase()}/</link>
      <guid isPermaLink="false">letterboxd-review-000000000</guid>
      <pubDate>Thu, 13 Aug 2026 12:00:00 +1200</pubDate>
      <letterboxd:watchedDate>${opts.watchedDate ?? ""}</letterboxd:watchedDate>
      <letterboxd:rewatch>No</letterboxd:rewatch>
      <letterboxd:filmTitle>${opts.filmTitle}</letterboxd:filmTitle>
      ${opts.filmYear !== undefined ? `<letterboxd:filmYear>${opts.filmYear}</letterboxd:filmYear>` : ""}
      ${opts.memberRating !== undefined ? `<letterboxd:memberRating>${opts.memberRating}</letterboxd:memberRating>` : ""}
      ${opts.tmdbMovieId !== undefined ? `<tmdb:movieId>${opts.tmdbMovieId}</tmdb:movieId>` : ""}
      <description><![CDATA[${POSTER}${opts.reviewHtml ?? "<p>Some review text.</p>"}]]></description>
    </item>`;
}

// A plain diary log: watched (and maybe starred), but never reviewed. This
// is the exact shape Letterboxd's own feed uses for these -- poster, then
// a single "Watched on <date>." sentence, nothing else.
function diaryLogOnlyItem(opts: {
  filmTitle: string;
  filmYear?: number;
  memberRating?: number;
  watchedDate?: string;
  tmdbMovieId?: number;
}): string {
  return `
    <item>
      <title>${opts.filmTitle}, ${opts.filmYear ?? ""}</title>
      <link>https://letterboxd.com/someuser/film/${opts.filmTitle.toLowerCase()}/</link>
      <guid isPermaLink="false">letterboxd-review-111111111</guid>
      <pubDate>Thu, 13 Aug 2026 12:00:00 +1200</pubDate>
      <letterboxd:watchedDate>${opts.watchedDate ?? ""}</letterboxd:watchedDate>
      <letterboxd:rewatch>No</letterboxd:rewatch>
      <letterboxd:filmTitle>${opts.filmTitle}</letterboxd:filmTitle>
      ${opts.filmYear !== undefined ? `<letterboxd:filmYear>${opts.filmYear}</letterboxd:filmYear>` : ""}
      ${opts.memberRating !== undefined ? `<letterboxd:memberRating>${opts.memberRating}</letterboxd:memberRating>` : ""}
      ${opts.tmdbMovieId !== undefined ? `<tmdb:movieId>${opts.tmdbMovieId}</tmdb:movieId>` : ""}
      <description><![CDATA[${POSTER}<p>Watched on Saturday June 6, 2026.</p>]]></description>
    </item>`;
}

function listItem(title: string): string {
  return `
    <item>
      <title>${title}</title>
      <link>https://letterboxd.com/someuser/list/${title.toLowerCase()}/</link>
      <guid isPermaLink="false">letterboxd-list-000000000</guid>
      <pubDate>Thu, 13 Aug 2026 12:00:00 +1200</pubDate>
      <description><![CDATA[<p>A list, not a film log entry.</p>]]></description>
    </item>`;
}

function feed(items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
  <channel>
    <title>Someuser's diary</title>
    <link>https://letterboxd.com/someuser/</link>
    ${items.join("\n")}
  </channel>
</rss>`;
}

describe("hasWrittenReview", () => {
  it("is true when review prose follows the poster paragraph", () => {
    expect(hasWrittenReview(`${POSTER}<p>Great flick.</p>`)).toBe(true);
  });

  it("is true when a numeric review-score bubble precedes the prose (Letterboxd's real format)", () => {
    expect(hasWrittenReview(`${POSTER} <p><b>65</b></p><p>Narratively overstuffed...</p>`)).toBe(true);
  });

  it("is false for a plain 'Watched on <date>.' diary log with no review", () => {
    expect(hasWrittenReview(`${POSTER} <p>Watched on Saturday June 6, 2026.</p>`)).toBe(false);
  });

  it("is false when there's no description at all", () => {
    expect(hasWrittenReview(undefined)).toBe(false);
  });

  it("is false for an empty description", () => {
    expect(hasWrittenReview("")).toBe(false);
  });
});

describe("parseLetterboxdRss", () => {
  it("parses reviewed entries with full metadata, including the tmdb movie id", () => {
    const xml = feed([
      reviewItem({
        filmTitle: "The Odyssey",
        filmYear: 2026,
        memberRating: 4.5,
        watchedDate: "2026-08-10",
        tmdbMovieId: 1234567,
      }),
    ]);

    expect(parseLetterboxdRss(xml)).toEqual([
      { name: "The Odyssey", year: 2026, rating: 4.5, watchedAt: "2026-08-10", tmdbId: 1234567 },
    ]);
  });

  it("defaults missing optional fields to null rather than omitting them", () => {
    const xml = feed([reviewItem({ filmTitle: "GoldenEye" })]);

    expect(parseLetterboxdRss(xml)).toEqual([
      { name: "GoldenEye", year: null, rating: null, watchedAt: null, tmdbId: null },
    ]);
  });

  it("skips List-type items that have no letterboxd:filmTitle", () => {
    const xml = feed([
      listItem("My Favorite Heist Movies"),
      reviewItem({ filmTitle: "Heat", filmYear: 1995, tmdbMovieId: 949 }),
    ]);

    expect(parseLetterboxdRss(xml)).toEqual([
      { name: "Heat", year: 1995, rating: null, watchedAt: null, tmdbId: 949 },
    ]);
  });

  it("skips plain diary logs that were watched/rated but never reviewed", () => {
    const xml = feed([
      diaryLogOnlyItem({ filmTitle: "Johnny Guitar", filmYear: 1954, memberRating: 5, tmdbMovieId: 35197 }),
      reviewItem({ filmTitle: "Heat", filmYear: 1995, tmdbMovieId: 949 }),
    ]);

    expect(parseLetterboxdRss(xml)).toEqual([
      { name: "Heat", year: 1995, rating: null, watchedAt: null, tmdbId: 949 },
    ]);
  });

  it("decodes HTML entities in film titles", () => {
    const xml = feed([reviewItem({ filmTitle: "Am&#233;lie", filmYear: 2001 })]);

    expect(parseLetterboxdRss(xml)[0].name).toBe("Amélie");
  });

  it("returns an empty array for a feed with no items", () => {
    expect(parseLetterboxdRss(feed([]))).toEqual([]);
  });

  it("returns an empty array when every item is an unreviewed diary log", () => {
    const xml = feed([diaryLogOnlyItem({ filmTitle: "The Post", filmYear: 2017 })]);
    expect(parseLetterboxdRss(xml)).toEqual([]);
  });
});
