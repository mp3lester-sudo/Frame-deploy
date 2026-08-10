// Kept separate from src/lib/actions/push.ts because a "use server" file
// may only export async functions -- TOGGLABLE_NOTIFICATION_TYPES was a
// plain const array exported alongside the server actions in that file,
// which is exactly the violation this pattern already exists to avoid in
// src/lib/constants/catalogue.ts and social.ts (see their comments). This
// one was missed when those were split out, and the resulting "A 'use
// server' file can only export async functions, found object" error was
// silently killing the settings page's Server Actions render whenever any
// action needed to redirect (signOut, signOutEverywhere, deleteAccount) --
// the digest-only production error gave no hint this was the cause.
//
/** The subset of NotificationType a user can actually toggle -- keep this
 *  in sync with migration 0043's check constraint. "payment_failed" is
 *  deliberately excluded everywhere (see that migration's comment). */
export const TOGGLABLE_NOTIFICATION_TYPES = [
  "follow",
  "comment",
  "reaction",
  "movie_night_invite",
  "movie_night_decided",
] as const;
export type TogglableNotificationType = (typeof TOGGLABLE_NOTIFICATION_TYPES)[number];
