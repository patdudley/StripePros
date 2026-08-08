import { afterEach, describe, expect, it } from "vitest";
import { getStripeRuntimeConfig, stripeIsConfigured } from "../lib/stripe";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Stripe runtime configuration", () => {
  it("stays disabled until both a secret key and price are supplied", () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    expect(stripeIsConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    expect(stripeIsConfigured()).toBe(false);
    process.env.STRIPE_PRICE_ID = "price_example";
    expect(stripeIsConfigured()).toBe(true);
  });

  it("keeps automatic tax opt-in", () => {
    process.env.STRIPE_PRICE_ID = "price_example";
    process.env.STRIPE_AUTOMATIC_TAX = "false";
    expect(getStripeRuntimeConfig()).toEqual({ priceId: "price_example", automaticTax: false });
    process.env.STRIPE_AUTOMATIC_TAX = "true";
    expect(getStripeRuntimeConfig().automaticTax).toBe(true);
  });
});
