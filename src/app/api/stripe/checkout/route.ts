import { NextResponse } from "next/server";
import { getStripe, PREMIUM_PRICE_ID } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";

/** Creates a Stripe Checkout session for the Premium subscription. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
    line_items: [{ price: PREMIUM_PRICE_ID, quantity: 1 }],
    success_url: `${origin}/premium?success=true`,
    cancel_url: `${origin}/premium?canceled=true`,
    metadata: { user_id: user.id },
  });

  return NextResponse.json({ url: session.url });
}
