import { json } from "@/lib/api";
import { stripeIsConfigured } from "@/lib/stripe";

export async function GET() {
  return json({
    configured: stripeIsConfigured(),
    mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
  });
}
