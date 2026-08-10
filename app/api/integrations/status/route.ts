import { json } from "@/lib/api";
import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { getIntegrationConnection } from "@/lib/integrations/store";
import { INTEGRATION_PROVIDERS, oauthProviderConfigured, type OAuthIntegrationProvider } from "@/lib/integrations/providers";

type ProviderStatus = { configured: boolean; connected: boolean; mode: string; accountName: string | null; accountId: string | null };

async function oauthStatus(ownerId: string | null, provider: OAuthIntegrationProvider): Promise<ProviderStatus> {
  const configured = oauthProviderConfigured(provider);
  const fallback = provider === "hubspot" ? Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN) : false;
  const connection = configured && ownerId ? await getIntegrationConnection(ownerId, provider).catch(() => null) : null;
  return {
    configured: configured || fallback,
    connected: Boolean(connection) || fallback,
    mode: connection ? "oauth" : fallback ? "private_app" : configured ? "oauth_ready" : "setup_required",
    accountName: connection?.externalAccountName || null,
    accountId: connection?.externalAccountId || null,
  };
}

export async function GET(request: Request) {
  const ownerId = await getScheduleOwnerId(request);
  const entries = await Promise.all(INTEGRATION_PROVIDERS.map(async (provider) => [provider, await oauthStatus(ownerId, provider)] as const));
  const providers = Object.fromEntries(entries) as Record<OAuthIntegrationProvider, ProviderStatus>;
  const oneCrewConfigured = Boolean(process.env.ONECREW_API_KEY);
  return json({ providers: {
    hubspot: providers.hubspot,
    jobber: providers.jobber,
    quickbooks: providers.quickbooks,
    onecrew: {
      configured: oneCrewConfigured,
      connected: oneCrewConfigured,
      mode: oneCrewConfigured ? "lead_api" : "setup_required",
      accountName: null,
      accountId: null,
    },
    stripe: {
      ...providers.stripe,
      configured: providers.stripe.configured || Boolean(process.env.STRIPE_SECRET_KEY),
      connected: providers.stripe.connected || Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
      mode: providers.stripe.connected ? providers.stripe.mode : process.env.STRIPE_SECRET_KEY ? "billing_ready" : providers.stripe.mode,
    },
  } });
}
