import { NextResponse } from "next/server";
import { getStripe, PREMIUM_PRICE_ID, ALIST_PRICE_ID } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";

/** Creates a Stripe Checkout session for either paid tier. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Defaults to "premium" both when no body is sent at all (the existing
  // Premium upgrade button's fetch call never sent one) and when the body
  // isn't valid JSON -- only an explicit {"tier":"a_list"} selects A-List.
  let tier: "premium" | "a_list" = "premium";
  try {
    const body = await request.json();
    if (body?.tier === "a_list") tier = "a_list";
  } catch {
    // No/invalid body -- premium default above stands.
  }

  const priceId = tier === "a_list" ? ALIST_PRICE_ID : PREMIUM_PRICE_ID;
  if (!priceId) {
    // A-List's real Stripe price hasn't been created yet (see
    // ALIST_PRICE_ID in lib/stripe.ts) -- the pricing page already hides
    // the buy button in this state, but a stale tab or a direct API call
    // should still fail loudly instead of sending Stripe an empty price.
    return NextResponse.json({ error: "This plan isn't available yet." }, { status: 400 });
  }

  const stripe = getStripe();
  const origin = new URL(request.url).origin;

  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: existingSub?.stripe_customer_id ?? undefined,
    customer_email: existingSub?.stripe_customer_id ? undefined : user.email,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    // Set on the session (read by checkout.session.completed) and on the
    // resulting subscription itself (read by subscription.updated/
    // deleted) -- Checkout session metadata does not automatically
    // propagate to the Subscription object it creates, so both need it
    // set explicitly for renewal/cancellation events to still know which
    // tier this subscription is.
    subscription_data: { metadata: { user_id: user.id, tier } },
    success_url: `${origin}/premium?success=true`,
    cancel_url: `${origin}/premium?canceled=true`,
    metadata: { user_id: user.id, tier },
  });

  return NextResponse.json({ url: session.url });
}
