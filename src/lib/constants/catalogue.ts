// Kept separate from src/lib/actions/catalogue.ts because a "use server" file
// may only export async functions — exporting these consts from there made
// Next.js treat the whole module as having no exports at build time.
export const DISCOVER_PAGE_SIZE = 30;
export const SEARCH_PAGE_SIZE = 24;
export const WATCHED_PAGE_SIZE = 30;

// Shared column list for Discover/Search's poster-grid queries -- these
// feed straight into TitleCard/LoadMoreGrid (see GridTitle in
// title-card.tsx), which only ever renders id/name/poster_url/type/
// in_production. The titles table carries ~35 columns total (overview,
// mood/tone/pacing tags, RT/TMDB scoring fields, etc.) that a browse grid
// never touches -- select("*") here was shipping all of it on every page
// load and every "Load more" page for no reason. Kept as one constant
// (rather than the literal string typed out four times across
// catalogue.ts/discover/search) so the grid's actual field needs and the
// query's select() list can't quietly drift apart.
export const GRID_TITLE_COLUMNS = "id, name, poster_url, type, in_production" as const;
