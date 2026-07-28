// Kept separate from src/lib/actions/catalogue.ts because a "use server" file
// may only export async functions — exporting these consts from there made
// Next.js treat the whole module as having no exports at build time.
export const DISCOVER_PAGE_SIZE = 30;
export const SEARCH_PAGE_SIZE = 24;
