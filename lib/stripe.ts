import Stripe from "stripe";

export type StripeRuntimeConfig = {
  priceId: string;
  automaticTax: boolean;
};

export function getStripeRuntimeConfig(): StripeRuntimeConfig {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID is not configured.");
  return {
    priceId,
    automaticTax: process.env.STRIPE_AUTOMATIC_TAX === "true",
  };
}

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}

export function stripeIsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}
