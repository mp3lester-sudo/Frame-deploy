import Papa from "papaparse";

/**
 * Letterboxd's official export (Settings → Import & Export → Export Data)
 * produces ratings.csv (Date, Name, Year, Letterboxd URI, Rating) and
 * watched.csv (Date, Name, Year, Letterboxd URI) — confirmed against real
 * community documentation of the export format, since Letterboxd's own docs
 * only cover their *import* format, not what comes out of an export. Neither
 * file includes a TMDB/IMDb ID, so matching against our catalogue has to go
 * by title + year.
 */
export interface LetterboxdRow {
  name: string;
  year: number | null;
  /** 0.5–5 in 0.5 increments, or null for watched.csv rows / unrated entries. */
  rating: number | null;
  /** ISO date (YYYY-MM-DD) from the export's own Date column -- the day
   *  this entry was logged on Letterboxd, i.e. the real watch date, not
   *  whenever this import happens to run. null for rows where the column
   *  is missing or unparseable (the paste-HTML import path below also
   *  produces rows with this as null -- Letterboxd's diary page markup
   *  doesn't expose a clean per-entry date without a live sample to
   *  reverse-engineer against, so that path is left as import-time only
   *  for now). Threaded into ratings.rated_at on import -- see
   *  lib/actions/import.ts -- instead of leaving every bulk-imported
   *  rating's timestamp collapsed to "whenever the import ran," which
   *  silently broke anything that reads rating history chronologically
   *  (taste evolution, recency-weighted taste vector).
   */
  watchedAt: string | null;
}

/** Letterboxd's Date column is `YYYY-MM-DD`; guards against a format
 *  change or stray blank cell rather than trusting it blindly. */
function parseWatchedAt(dateRaw: string | undefined): string | null {
  const trimmed = dateRaw?.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export function parseLetterboxdCsv(csvText: string): LetterboxdRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data
    .map((row) => {
      const name = (row.Name ?? "").trim();
      if (!name) return null;
      const yearRaw = row.Year?.trim();
      const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
      const ratingRaw = row.Rating?.trim();
      const rating = ratingRaw && !Number.isNaN(Number(ratingRaw)) ? Number(ratingRaw) : null;
      const watchedAt = parseWatchedAt(row.Date);
      return { name, year, rating, watchedAt };
    })
    .filter((r): r is LetterboxdRow => r !== null);
}

export type CatalogueTitle = { id: string; name: string; release_date: string | null };

export interface TitleIndex {
  /** `${lowercased name}|${year}` -> title id, for exact matches. */
  byNameYear: Map<string, string>;
  /** lowercased name -> candidate titles, for the year-off-by-one fallback. */
  byName: Map<string, { id: string; year: number | null }[]>;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function yearOf(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

export function buildTitleIndex(titles: CatalogueTitle[]): TitleIndex {
  const byNameYear = new Map<string, string>();
  const byName = new Map<string, { id: string; year: number | null }[]>();

  for (const title of titles) {
    const name = normalizeName(title.name);
    const year = yearOf(title.release_date);

    if (year !== null) byNameYear.set(`${name}|${year}`, title.id);

    const existing = byName.get(name);
    if (existing) existing.push({ id: title.id, year });
    else byName.set(name, [{ id: title.id, year }]);
  }

  return { byNameYear, byName };
}

/**
 * Exact name+year match first. Falling back to fuzzy name-only similarity
 * risks silently attaching a rating to the wrong film (remakes, sequels
 * that reuse a title) — worse than just leaving it unmatched — so the only
 * fallback here is an unambiguous name match within a year of the target,
 * to cover regional release-date discrepancies (a film premiering in
 * Dec 2019 in one country and Jan 2020 in another, etc).
 */
export function matchTitle(row: LetterboxdRow, index: TitleIndex): string | null {
  const name = normalizeName(row.name);

  if (row.year !== null) {
    const exact = index.byNameYear.get(`${name}|${row.year}`);
    if (exact) return exact;
  }

  const candidates = index.byName.get(name);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1 && row.year === null) return candidates[0].id;

  if (row.year !== null) {
    const withinOneYear = candidates.filter((c) => c.year !== null && Math.abs(c.year - row.year!) <= 1);
    if (withinOneYear.length === 1) return withinOneYear[0].id;
  }

  return null;
}
