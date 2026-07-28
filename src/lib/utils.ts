import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a 0-5 rating (half-star increments) for display, e.g. "4.5". */
export function formatRating(score: number | null | undefined) {
  if (score == null) return "—";
  return score.toFixed(1);
}

export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
