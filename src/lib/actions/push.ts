"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { z } from "zod";

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
