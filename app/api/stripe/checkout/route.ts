import { apiError, json } from "@/lib/api";
import { readSession } from "@/lib/session";
import { getStripe, getStripeRuntimeConfig } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const config = getStripeRuntimeConfig();
    const userId = await readSession(request);
    const origin = new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ui_mode: "hosted",
      line_items: [{ price: config.priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: config.automaticTax },
      client_reference_id: userId ?? undefined,
      metadata: userId ? { stripe_pros_user_id: userId } : undefined,
    });

    if (!session.url) return json({ error: "Stripe did not return a checkout URL." }, 502);
    return json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
