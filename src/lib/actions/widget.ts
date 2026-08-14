"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";

/**
 * Mints (or returns the existing) bearer token the iOS home-screen
 * widget uses to fetch this person's daily pick -- see migration 0067's
 * comment on profiles.widget_token for why a widget needs its own
 * credential at all (WidgetKit's process has no cookies/session).
 *
 * Called from the native app shell right after login/app-open (see the
 * native-only widget-token-bootstrap component) so the token can be
 * written into the shared App Group container the widget extension
 * reads from. Idempotent -- re-calling this on every app-open just
 * returns the same token rather than rotating it, so adding the widget
 * doesn't require re-opening the app afterward for it to start working.
 */
export async function getOrCreateWidgetToken(): Promise<string> {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");

  const { data } = await supabase.from("profiles").select("widget_token").eq("id", user.id).maybeSingle();
  if (data?.widget_token) return data.widget_token;

  // 32 hex chars (128 bits) -- this travels in a URL query string to an
  // endpoint that returns real personal data (today's pick), so it
  // warrants real entropy, unlike movie_nights.invite_token (0037, 10
  // hex chars) which only ever gates "can view a shareable session
  // preview," a much lower-stakes surface.
  const token = randomBytes(16).toString("hex");
  const { error } = await supabase.from("profiles").update({ widget_token: token }).eq("id", user.id);
  if (error) throw new Error(error.message);
  return token;
}
