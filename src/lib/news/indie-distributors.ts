/**
 * TMDB "company" ids for distributors widely recognized as indie/specialty
 * labels -- used to filter /discover/movie so the Indie Spotlight section
 * (home page + Social feed) surfaces films from studios actually known for
 * independent and arthouse work, rather than TMDB's general new-releases
 * list which skews toward studio tentpoles.
 *
 * Ids verified against themoviedb.org/company/<id> directly (not guessed):
 * A24 (41077), NEON (90733), Magnolia Pictures (1030), and Searchlight
 * Pictures (127929, the current entity -- 43 is the legacy "Fox
 * Searchlight" id from before the Disney/Fox merger rebrand and is kept
 * here too so older catalogue titles still match).
 *
 * Searchlight is Disney-owned and NEON/A24/Magnolia aren't fully
 * "independent" in the financing sense either, but all four are the
 * industry's standard reference points for specialty/arthouse
 * distribution -- this list is a curation signal, not a legal definition
 * of "indie."
 */
export const INDIE_DISTRIBUTOR_IDS = [41077, 90733, 1030, 127929, 43] as const;
