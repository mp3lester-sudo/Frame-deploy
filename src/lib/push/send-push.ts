import "server-only";
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/server";

let configured = false;

function ensureConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@example.com";
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * 404/410 from a push endpoint means the browser/OS has permanently
 * invalidated that subscription (uninstalled, unsubscribed, expired) --
 * pulled out as its own function so this "is it worth pruning" decision
 * is testable without going through a real (or mocked) web-push send.
 * Any other status (network blip, 5xx, rate limit) is left alone; it
 * might succeed next time.
 */
export function isPermanentlyInvalidSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Sends a Web Push notification to every device/browser a user has
 * subscribed on, alongside (not instead of) the existing in-app
 * notification row -- see notify() in src/lib/actions/notifications.ts,
 * which calls this right after its insert. Deliberately best-effort at
 * every level (missing VAPID env vars, a single subscription failing)
 * since a push delivery problem should never be the thing that breaks
 * whatever action (a follow, a Movie Night decision) triggered it.
 *
 * Uses the service-role client rather than a request-scoped one: this
 * runs on behalf of the ACTOR (e.g. the person who just followed someone),
 * reading the RECIPIENT's push_subscriptions rows, which an
 * "auth.uid() = user_id" policy would never allow the actor's own session
 * to see. Same reasoning as the actor-keyed insert policy on
 * notifications itself.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const supabase = createServiceRoleClient();
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subscriptions || subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    const staleIds: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body
          );
        } catch (err) {
          // 404/410 means the browser/OS has permanently invalidated this
          // endpoint (uninstalled, unsubscribed, expired) -- prune it so
          // future sends don't keep paying for a request that can never
          // succeed. Any other error (network blip, service outage) is
          // left alone; it might work next time.
          const status = (err as { statusCode?: number })?.statusCode;
          if (isPermanentlyInvalidSubscription(status)) staleIds.push(sub.id);
        }
      })
    );

    if (staleIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", staleIds);
    }
  } catch {
    // Best-effort -- see doc comment above.
  }
}
