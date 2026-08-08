import { json } from "@/lib/api";

export async function GET() {
  return json({
    jobber: Boolean(process.env.JOBBER_CLIENT_ID && process.env.JOBBER_CLIENT_SECRET),
    quickbooks: Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET),
    hubspot: Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN),
    webhook: Boolean(process.env.STRIPEPROS_OUTBOUND_WEBHOOK_URL),
  });
}
