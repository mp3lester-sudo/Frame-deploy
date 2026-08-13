import { describe, it, expect } from "vitest";
import { parseLetterboxdCsv, buildTitleIndex, matchTitle } from "@/lib/import/letterboxd";

describe("parseLetterboxdCsv", () => {
  it("parses a ratings.csv-shaped file, including quoted names with commas", () => {
    const csv = `Date,Name,Year,Letterboxd URI,Rating\n2024-01-01,Top Gun,1986,https://letterboxd.com/film/top-gun/,5\n2024-01-02,"Paris, Texas",1984,https://letterboxd.com/film/paris-texas/,4.5`;
    const rows = parseLetterboxdCsv(csv);
    expect(rows).toEqual([
      { name: "Top Gun", year: 1986, rating: 5, watchedAt: "2024-01-01" },
      { name: "Paris, Texas", year: 1984, rating: 4.5, watchedAt: "2024-01-02" },
    ]);
  });

  it("parses a watched.csv-shaped file with no Rating column", () => {
    const csv = `Date,Name,Year,Letterboxd URI\n2024-01-01,Arrival,2016,https://letterboxd.com/film/arrival-2016/`;
    const rows = parseLetterboxdCsv(csv);
    expect(rows).toEqual([{ name: "Arrival", year: 2016, rating: null, watchedAt: "2024-01-01" }]);
  });

  it("skips rows with no Name and tolerates a missing/malformed Year", () => {
    const csv = `Date,Name,Year,Rating\n2024-01-01,,2020,4\n2024-01-02,Some Film,n/a,3\n2024-01-03,Another Film,2021,2`;
    const rows = parseLetterboxdCsv(csv);
    expect(rows).toEqual([
      { name: "Some Film", year: null, rating: 3, watchedAt: "2024-01-02" },
      { name: "Another Film", year: 2021, rating: 2, watchedAt: "2024-01-03" },
    ]);
  });

  it("leaves watchedAt null when the Date column is missing or malformed", () => {
    const csv = `Name,Year,Rating\nNo Date Film,2020,4`;
    const rows = parseLetterboxdCsv(csv);
    expect(rows).toEqual([{ name: "No Date Film", year: 2020, rating: 4, watchedAt: null }]);

    const malformed = `Date,Name,Year,Rating\nnot-a-date,Bad Date Film,2020,4`;
    expect(parseLetterboxdCsv(malformed)).toEqual([
      { name: "Bad Date Film", year: 2020, rating: 4, watchedAt: null },
    ]);
  });
});

describe("buildTitleIndex / matchTitle", () => {
  const index = buildTitleIndex([
    { id: "1", name: "Arrival", release_date: "2016-11-11" },
    { id: "2", name: "Swan Song", release_date: "2021-08-13" },
    // A same-titled remake in a different year — the ambiguous case.
    { id: "3", name: "Swan Song", release_date: "1992-01-01" },
    { id: "4", name: "Gravity", release_date: "2013-10-03" },
  ]);

  it("matches on exact name + year", () => {
    expect(matchTitle({ name: "Arrival", year: 2016, rating: 4, watchedAt: null }, index)).toBe("1");
  });

  it("matches case-insensitively", () => {
    expect(matchTitle({ name: "arrival", year: 2016, rating: null, watchedAt: null }, index)).toBe("1");
  });

  it("falls back to an unambiguous name match within one year", () => {
    expect(matchTitle({ name: "Gravity", year: 2014, rating: 5, watchedAt: null }, index)).toBe("4");
  });

  it("refuses to guess when the name matches multiple candidates ambiguously", () => {
    // Neither 2021 nor 1992 is within a year of some unrelated target year.
    expect(matchTitle({ name: "Swan Song", year: 2005, rating: 3, watchedAt: null }, index)).toBeNull();
  });

  it("resolves an ambiguous name when the year narrows it to one candidate", () => {
    expect(matchTitle({ name: "Swan Song", year: 2021, rating: 3, watchedAt: null }, index)).toBe("2");
    expect(matchTitle({ name: "Swan Song", year: 1992, rating: 3, watchedAt: null }, index)).toBe("3");
  });

  it("returns null for a title with no name match at all", () => {
    expect(matchTitle({ name: "Totally Made Up Film Title", year: 2020, rating: 3, watchedAt: null }, index)).toBeNull();
  });

  it("matches an unambiguous single-candidate title even with no year in the CSV row", () => {
    expect(matchTitle({ name: "Arrival", year: null, rating: null, watchedAt: null }, index)).toBe("1");
  });
});
