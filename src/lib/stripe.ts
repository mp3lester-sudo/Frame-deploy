import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe() {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
    });
  }
  return client;
}

export const PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID!;

// Not yet created in the Stripe Dashboard as of this tier's initial
// build -- checkout requests for "a_list" 400 cleanly (see
// src/app/api/stripe/checkout/route.ts) rather than hitting Stripe with
// an empty/invalid price, and the pricing page shows a "coming soon"
// state instead of a working buy button, until this env var is set.
export const ALIST_PRICE_ID = process.env.STRIPE_ALIST_PRICE_ID ?? "";
