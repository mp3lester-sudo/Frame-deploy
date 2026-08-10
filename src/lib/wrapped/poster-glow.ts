/**
 * Deterministic "color-extracted" background glow for a poster, without
 * actually sampling pixels off the image -- real dominant-color extraction
 * needs either a client-side canvas readback (which silently breaks for
 * any poster host that doesn't send permissive CORS headers, and TMDB's
 * image CDN isn't guaranteed to) or a server-side pipeline with its own
 * new dependency and a cache column to avoid recomputing on every view.
 * Neither is worth the risk/cost for a purely decorative glow, so this
 * hashes the title id into a small curated palette instead -- same title
 * always gets the same glow (stable across a replay or a re-render), and
 * every pair in the palette is picked to already sit inside the app's
 * velvet-and-gold family rather than clashing with it.
 */
export interface PosterGlow {
  from: string;
  to: string;
}

const PALETTE: PosterGlow[] = [
  { from: "#7a4a3c", to: "#120708" },
  { from: "#6b3a52", to: "#160a10" },
  { from: "#3c5a6b", to: "#0a1216" },
  { from: "#5a6b3c", to: "#101608" },
  { from: "#8a6a3c", to: "#1a1006" },
  { from: "#4a3c6b", to: "#0e0a16" },
  { from: "#6b4a3c", to: "#160e0a" },
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getPosterGlow(titleId: string): PosterGlow {
  return PALETTE[hashString(titleId) % PALETTE.length];
}
