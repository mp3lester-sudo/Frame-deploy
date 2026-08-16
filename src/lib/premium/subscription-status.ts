/**
 * Pulled out of the Stripe webhook route (src/app/api/stripe/webhook/route.ts)
 * so the two decisions that actually flip a user's is_premium flag --
 * "is this Stripe subscription status one that should grant Premium?" and
 * "which Stripe customer does this event belong to?" -- are plain,
 * testable functions instead of logic buried inline in a handler that
 * needs a live webhook signature to even reach. Previously this whole
 * file (money in, access out) had zero test coverage.
 */

/**
 * Stripe subscription statuses: "trialing" and "active" both mean the
 * subscriber should have Premium; everything else (past_due, canceled,
 * unpaid, incomplete, incomplete_expired, paused) should not. Trialing is
 * included deliberately -- if Slate ever adds a trial period, someone
 * mid-trial should already have Premium, not be waiting for their first
 * successful charge.
 */
export function isSubscriptionStatusActive(status: string): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Stripe's `customer` field on Invoice/Subscription/Checkout.Session
 * objects is typed as `string | Stripe.Customer | Stripe.DeletedCustomer
 * | null` -- a plain ID unless the request expanded it into a full object.
 * This app's webhook never expands `customer`, but handling both shapes
 * defensively costs nothing and avoids a crash if that ever changes.
 */
export function resolveStripeCustomerId(
  customer: string | { id: string } | null | undefined
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}
