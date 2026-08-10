export const INTEGRATION_PROVIDERS = ["hubspot", "jobber", "quickbooks", "stripe"] as const;
export type OAuthIntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationProviderDefinition = {
  id: OAuthIntegrationProvider;
  name: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
};

export function isOAuthIntegrationProvider(value: string): value is OAuthIntegrationProvider {
  return INTEGRATION_PROVIDERS.includes(value as OAuthIntegrationProvider);
}

export function integrationTokenKey() {
  return process.env.INTEGRATION_TOKEN_KEY?.trim() || "";
}

export function providerDefinition(provider: OAuthIntegrationProvider): IntegrationProviderDefinition {
  if (provider === "hubspot") return {
    id: provider,
    name: "HubSpot",
    clientId: process.env.HUBSPOT_CLIENT_ID?.trim() || "",
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET?.trim() || "",
    authorizationUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v3/token",
    scopes: ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.read", "crm.objects.deals.write"],
  };
  if (provider === "jobber") return {
    id: provider,
    name: "Jobber",
    clientId: process.env.JOBBER_CLIENT_ID?.trim() || "",
    clientSecret: process.env.JOBBER_CLIENT_SECRET?.trim() || "",
    authorizationUrl: "https://api.getjobber.com/api/oauth/authorize",
    tokenUrl: "https://api.getjobber.com/api/oauth/token",
    scopes: [],
    pkce: true,
  };
  if (provider === "quickbooks") return {
    id: provider,
    name: "QuickBooks",
    clientId: process.env.QUICKBOOKS_CLIENT_ID?.trim() || "",
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET?.trim() || "",
    authorizationUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: ["com.intuit.quickbooks.accounting", "openid", "profile", "email"],
  };
  return {
    id: provider,
    name: "Stripe",
    clientId: process.env.STRIPE_CONNECT_CLIENT_ID?.trim() || "",
    clientSecret: process.env.STRIPE_SECRET_KEY?.trim() || "",
    authorizationUrl: "https://connect.stripe.com/oauth/authorize",
    tokenUrl: "https://connect.stripe.com/oauth/token",
    scopes: ["read_write"],
  };
}

export function oauthProviderConfigured(provider: OAuthIntegrationProvider) {
  const definition = providerDefinition(provider);
  return Boolean(definition.clientId && definition.clientSecret && integrationTokenKey().length >= 32);
}

