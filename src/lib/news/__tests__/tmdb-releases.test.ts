import { describe, it, expect } from "vitest";
import { mapDiscoverResultsToReleases, formatReleaseDate } from "@/lib/news/tmdb-releases";

describe("mapDiscoverResultsToReleases", () => {
  const today = "2026-08-01";

  it("maps core fields and builds a w342 poster url", () => {
    const [release] = mapDiscoverResultsToReleases(
      [{ id: 1, title: "Aftersun", release_date: "2026-07-01", poster_path: "/abc.jpg", overview: "A father and daughter." }],
      today
    );
    expect(release).toEqual({
      tmdbId: 1,
      title: "Aftersun",
      releaseDate: "2026-07-01",
      posterUrl: "https://image.tmdb.org/t/p/w342/abc.jpg",
      overview: "A father and daughter.",
      status: "new",
    });
  });

  it("classifies a past-or-today release date as new", () => {
    const [release] = mapDiscoverResultsToReleases([{ id: 1, title: "X", release_date: today }], today);
    expect(release.status).toBe("new");
  });

  it("classifies a future release date as upcoming", () => {
    const [release] = mapDiscoverResultsToReleases([{ id: 1, title: "X", release_date: "2026-09-01" }], today);
    expect(release.status).toBe("upcoming");
  });

  it("falls back to null poster when poster_path is missing", () => {
    const [release] = mapDiscoverResultsToReleases([{ id: 1, title: "X", release_date: today }], today);
    expect(release.posterUrl).toBeNull();
  });

  it("drops results with neither a title nor a name", () => {
    const releases = mapDiscoverResultsToReleases([{ id: 1, release_date: today }], today);
    expect(releases).toHaveLength(0);
  });

  it("falls back to `name` for tv-shaped results", () => {
    const [release] = mapDiscoverResultsToReleases([{ id: 1, name: "Some Show", release_date: today }], today);
    expect(release.title).toBe("Some Show");
  });

  it("sorts ascending by release date", () => {
    const releases = mapDiscoverResultsToReleases(
      [
        { id: 1, title: "Later", release_date: "2026-10-01" },
        { id: 2, title: "Sooner", release_date: "2026-08-05" },
      ],
      today
    );
    expect(releases.map((r) => r.title)).toEqual(["Sooner", "Later"]);
  });

  it("sorts null release dates first (empty string sorts lowest)", () => {
    const releases = mapDiscoverResultsToReleases(
      [
        { id: 1, title: "Has date", release_date: "2026-08-05" },
        { id: 2, title: "No date" },
      ],
      today
    );
    expect(releases[0].title).toBe("No date");
  });
});

describe("formatReleaseDate", () => {
  it("formats an ISO date as short month + day", () => {
    expect(formatReleaseDate("2026-08-12")).toBe("Aug 12");
  });

  it("returns the raw string if it can't be parsed", () => {
    expect(formatReleaseDate("not-a-date")).toBe("not-a-date");
  });
});
