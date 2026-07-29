/** Minimal shape theme matching needs from a title row. */
export interface ThemeMatchableTitle {
  genres: string[] | null;
  tone: string[] | null;
  themes: string[] | null;
  mood_tags: string[] | null;
  release_date: string | null;
}

/** Only the filtering fields — decoupled from ThemePreset's display-only
 *  name/description, since a game_pass_seasons row (which has the same
 *  filter data but no ThemePreset type) needs to be usable here too. */
export interface ThemeFilter {
  genres: string[];
  keywords: string[];
  decadeMin: number | null;
  decadeMax: number | null;
}

/**
 * A title qualifies for a theme if it hits the genre list OR the AI-tagged
 * keyword list (same substring-match approach as taste-dna/archetypes.ts,
 * for consistency) — then, if the theme specifies a decade range, the title
 * must additionally fall inside it. No genres/keywords/decade means "no
 * constraint on that axis," not "matches everything."
 */
export function titleMatchesTheme(title: ThemeMatchableTitle, theme: ThemeFilter): boolean {
  const genreHit = theme.genres.length > 0 && (title.genres ?? []).some((g) => theme.genres.includes(g));

  const haystack = [...(title.tone ?? []), ...(title.themes ?? []), ...(title.mood_tags ?? [])].join(" ").toLowerCase();
  const keywordHit = theme.keywords.length > 0 && theme.keywords.some((kw) => haystack.includes(kw));

  if (!genreHit && !keywordHit) return false;

  if (theme.decadeMin != null || theme.decadeMax != null) {
    const year = title.release_date ? Number(title.release_date.slice(0, 4)) : null;
    if (year == null || !Number.isFinite(year)) return false;
    if (theme.decadeMin != null && year < theme.decadeMin) return false;
    if (theme.decadeMax != null && year > theme.decadeMax) return false;
  }

  return true;
}
