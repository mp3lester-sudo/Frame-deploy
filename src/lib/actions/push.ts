"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { z } from "zod";
import { TOGGLABLE_NOTIFICATION_TYPES, type TogglableNotificationType } from "@/lib/constants/notifications";

async function requireUser() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * Called from the client right after a successful pushManager.subscribe()
 * (see PushToggle in src/components/settings/push-toggle.tsx). Upserts on
 * (user_id, endpoint) -- migration 0041's unique constraint -- so
 * re-subscribing the same browser (permission re-granted, page reload)
 * updates the existing row instead of erroring or piling up duplicates
 * that would otherwise get pushed to twice.
 */
export async function subscribeToPush(input: z.infer<typeof subscribeSchema>) {
  const { endpoint, keys } = subscribeSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: "user_id,endpoint" }
  );
  if (error) throw new Error(error.message);
}

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function unsubscribeFromPush(input: z.infer<typeof unsubscribeSchema>) {
  const { endpoint } = unsubscribeSchema.parse(input);
  const { supabase, user } = await requireUser();

  await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
}


/**
 * Returns push-enabled state for every togglable type, defaulting to
 * `true` for any type without a stored row -- see migration 0043's
 * opt-out reasoning. Used by NotificationPreferences
 * (src/components/settings/notification-preferences.tsx) to render the
 * per-type checklist under the master PushToggle switch.
 */
export async function getNotificationPreferences(): Promise<Record<TogglableNotificationType, boolean>> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("notification_preferences")
    .select("type, push_enabled")
    .eq("user_id", user.id);

  const byType = new Map((data ?? []).map((row) => [row.type, row.push_enabled]));
  const result = {} as Record<TogglableNotificationType, boolean>;
  for (const type of TOGGLABLE_NOTIFICATION_TYPES) {
    result[type] = byType.get(type) ?? true;
  }
  return result;
}

const setPreferenceSchema = z.object({
  type: z.enum(TOGGLABLE_NOTIFICATION_TYPES),
  enabled: z.boolean(),
});

export async function setNotificationPreference(input: z.infer<typeof setPreferenceSchema>) {
  const { type, enabled } = setPreferenceSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: user.id, type, push_enabled: enabled },
      { onConflict: "user_id,type" }
    );
  if (error) throw new Error(error.message);
}
