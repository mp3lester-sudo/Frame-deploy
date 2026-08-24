"use client";

import { useEffect, useState, useTransition } from "react";
import { getNotificationPreferences, setNotificationPreference } from "@/lib/actions/push";
import { TOGGLABLE_NOTIFICATION_TYPES, type TogglableNotificationType } from "@/lib/constants/notifications";

const LABELS: Record<TogglableNotificationType, string> = {
  follow: "New followers",
  comment: "Comments on your reviews",
  reaction: "Reactions to your reviews",
  movie_night_invite: "Movie Night invites",
  movie_night_decided: "Movie Night decisions",
  new_from_favorite_director: "New releases from directors you love",
};

/**
 * Per-type push checklist shown under PushToggle's master switch --
 * previously that switch was the only control anyone had (fully on or
 * fully off for every push type at once). Reads/writes
 * notification_preferences (migration 0043) via the actions in
 * lib/actions/push.ts.
 */
export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Record<TogglableNotificationType, boolean> | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    getNotificationPreferences().then(setPrefs);
  }, []);

  if (!prefs) return null;

  function toggle(type: TogglableNotificationType) {
    const next = !prefs![type];
    setPrefs((prev) => (prev ? { ...prev, [type]: next } : prev));
    startTransition(async () => {
      try {
        await setNotificationPreference({ type, enabled: next });
      } catch {
        setPrefs((prev) => (prev ? { ...prev, [type]: !next } : prev));
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Notify me about</p>
      {TOGGLABLE_NOTIFICATION_TYPES.map((type) => (
        <label key={type} className="flex items-center justify-between gap-3 text-sm">
          <span>{LABELS[type]}</span>
          <input
            type="checkbox"
            checked={prefs[type]}
            onChange={() => toggle(type)}
            className="h-4 w-4 accent-accent"
          />
        </label>
      ))}
    </div>
  );
}
