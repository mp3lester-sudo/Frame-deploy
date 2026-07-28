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
