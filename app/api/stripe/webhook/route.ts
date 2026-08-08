import Stripe from "stripe";
import { json } from "@/lib/api";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) return json({ error: "Stripe webhook verification is not configured." }, 503);

  try {
    const event = await getStripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );

    // Subscription provisioning is intentionally deferred until account billing
    // fields are added to the user model. The verified endpoint is ready to receive:
    // checkout.session.completed, invoice.paid, invoice.payment_failed, and
    // customer.subscription.deleted.
    console.info(`Verified Stripe event: ${event.type}`);
    return json({ received: true, type: event.type });
  } catch (error) {
    console.error("Stripe webhook verification failed", error);
    return json({ error: "Invalid Stripe webhook signature." }, 400);
  }
}
