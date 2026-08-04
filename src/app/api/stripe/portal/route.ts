import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";

/**
 * Creates a Stripe Billing Portal session so a subscriber can cancel,
 * change plans, or view invoices themselves -- previously the only way to
 * touch a subscription at all was the checkout route (new subscribes) and
 * the webhook (server-side updates); there was no self-service path for
 * an existing subscriber to manage what they already have.
 *
 * Requires the Customer Portal to be activated once in the Stripe
 * Dashboard (Settings -> Billing -> Customer portal) for whichever mode
 * (test/live) this is running against -- Stripe returns a clear error if
 * it isn't, rather than failing silently.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription on file" }, { status: 404 });
  }

  const stripe = getStripe();
  const origin = new URL(request.url).origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/premium`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe portal] failed to create session", err);
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
