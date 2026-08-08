import { z } from "zod";
import { json } from "@/lib/api";

const exportSchema = z.object({
  provider: z.enum(["hubspot", "webhook"]),
  address: z.string().min(5).max(300),
  total: z.number().nonnegative().finite(),
  itemCount: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const parsed = exportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "The estimate export is incomplete." }, 400);
  const payload = parsed.data;

  if (payload.provider === "hubspot") {
    const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (!token) return json({ error: "Add a HubSpot private app token before exporting." }, 409);
    const response = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: {
        dealname: `Stripe Pros estimate — ${payload.address.slice(0, 90)}`,
        amount: payload.total.toFixed(2),
        pipeline: "default",
        dealstage: process.env.HUBSPOT_DEAL_STAGE_ID || "appointmentscheduled",
        description: `${payload.itemCount} priced scope items generated in Stripe Pros.`,
      } }),
    });
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) return json({ error: result.message || "HubSpot rejected the estimate export." }, 502);
    return json({ ok: true, externalId: result.id, message: "Estimate created as a HubSpot deal." });
  }

  const webhookUrl = process.env.STRIPEPROS_OUTBOUND_WEBHOOK_URL;
  if (!webhookUrl) return json({ error: "Add a Zapier, Make, or CRM webhook URL before exporting." }, 409);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.STRIPEPROS_OUTBOUND_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.STRIPEPROS_OUTBOUND_WEBHOOK_SECRET}` } : {}),
    },
    body: JSON.stringify({ event: "estimate.ready", source: "stripe-pros", estimate: { address: payload.address, total: payload.total, itemCount: payload.itemCount } }),
  });
  if (!response.ok) return json({ error: "The connected webhook did not accept the estimate." }, 502);
  return json({ ok: true, message: "Estimate sent to the connected automation." });
}
