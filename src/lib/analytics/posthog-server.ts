import { PostHog } from "posthog-node";

/**
 * Server-side capture for events that happen with no browser in the loop
 * -- the Stripe webhook is the motivating case (a subscription activating
 * is reported by Stripe's servers, not a page the user is looking at, so
 * there's no client-side posthog-js instance around to fire it from).
 *
 * posthog-node recommends a short flush interval / small flushAt in
 * serverless environments (Vercel functions don't stay warm long enough
 * for the default batching windows to reliably flush), and shutdown()
 * should be awaited before the function returns so a batched event isn't
 * silently dropped when the invocation ends.
 */
let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const posthog = getClient();
  if (!posthog) return;
  posthog.capture({ distinctId, event, properties });
  await posthog.shutdown();
  client = null;
}
