import { getIntegrationConnection, saveIntegrationConnection, decryptIntegrationValue, encryptIntegrationValue } from "./store";
import { oauthProviderConfigured, providerDefinition, type OAuthIntegrationProvider } from "./providers";

type OAuthState = { ownerId: string; provider: OAuthIntegrationProvider; verifier: string; expiresAt: number };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; stripe_user_id?: string; hub_id?: number; scope?: string; scopes?: string[]; error?: string; error_description?: string };

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function createIntegrationOAuthState(ownerId: string, provider: OAuthIntegrationProvider) {
  const state: OAuthState = { ownerId, provider, verifier: randomVerifier(), expiresAt: Date.now() + 10 * 60_000 };
  return { state: await encryptIntegrationValue(JSON.stringify(state)), verifier: state.verifier };
}

export async function verifyIntegrationOAuthState(value: string, provider: OAuthIntegrationProvider) {
  const state = JSON.parse(await decryptIntegrationValue(value)) as OAuthState;
  if (!state.ownerId || state.provider !== provider || state.expiresAt < Date.now()) throw new Error("The integration connection expired. Start again.");
  return state;
}

export async function integrationAuthorizationUrl(ownerId: string, provider: OAuthIntegrationProvider, redirectUri: string) {
  if (!oauthProviderConfigured(provider)) throw new Error(`${providerDefinition(provider).name} is not configured yet.`);
  const definition = providerDefinition(provider);
  const oauthState = await createIntegrationOAuthState(ownerId, provider);
  const params = new URLSearchParams({ client_id: definition.clientId, redirect_uri: redirectUri, response_type: "code", state: oauthState.state });
  if (provider === "hubspot") params.set("scope", definition.scopes.join(" "));
  if (provider === "quickbooks") params.set("scope", definition.scopes.join(" "));
  if (provider === "stripe") params.set("scope", "read_write");
  if (definition.pkce) {
    params.set("code_challenge", await pkceChallenge(oauthState.verifier));
    params.set("code_challenge_method", "S256");
  }
  return `${definition.authorizationUrl}?${params}`;
}

function tokenError(token: TokenResponse, provider: OAuthIntegrationProvider) {
  return token.error_description || token.error || `${providerDefinition(provider).name} did not complete the connection.`;
}

async function requestTokens(provider: OAuthIntegrationProvider, body: URLSearchParams) {
  const definition = providerDefinition(provider);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (provider === "quickbooks") headers.Authorization = `Basic ${btoa(`${definition.clientId}:${definition.clientSecret}`)}`;
  const response = await fetch(definition.tokenUrl, { method: "POST", headers, body });
  const token = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !token.access_token) throw new Error(tokenError(token, provider));
  return token;
}

async function jobberAccount(accessToken: string) {
  const response = await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "X-JOBBER-GRAPHQL-VERSION": "2025-04-16", "Content-Type": "application/json" },
    body: JSON.stringify({ query: "query StripeProsConnectedAccount { account { id name } }" }),
  });
  const result = await response.json().catch(() => ({})) as { data?: { account?: { id?: string; name?: string } } };
  return result.data?.account || {};
}

export async function exchangeIntegrationCode(ownerId: string, provider: OAuthIntegrationProvider, code: string, redirectUri: string, stateVerifier: string, callback: URL) {
  const definition = providerDefinition(provider);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (provider !== "quickbooks" && provider !== "stripe") {
    body.set("client_id", definition.clientId);
    body.set("client_secret", definition.clientSecret);
  }
  if (provider === "jobber") body.set("code_verifier", stateVerifier);
  if (provider === "stripe") body.set("client_secret", definition.clientSecret);
  const token = await requestTokens(provider, body);
  const account = provider === "jobber" ? await jobberAccount(token.access_token!) : {};
  const externalAccountId = provider === "quickbooks" ? callback.searchParams.get("realmId")
    : provider === "stripe" ? token.stripe_user_id || null
    : provider === "hubspot" ? token.hub_id?.toString() || null
    : account.id || null;
  await saveIntegrationConnection(ownerId, {
    provider,
    accessToken: token.access_token!,
    refreshToken: token.refresh_token || "",
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
    externalAccountId,
    externalAccountName: account.name || null,
    metadata: { tokenType: token.token_type || "Bearer", scopes: token.scopes || token.scope || definition.scopes },
  });
}

export async function validIntegrationAccessToken(ownerId: string, provider: OAuthIntegrationProvider) {
  const connection = await getIntegrationConnection(ownerId, provider);
  if (!connection) throw new Error(`Connect ${providerDefinition(provider).name} first.`);
  if (!connection.expiresAt || new Date(connection.expiresAt).getTime() > Date.now() + 60_000) return connection.accessToken;
  if (!connection.refreshToken || provider === "stripe") throw new Error(`${providerDefinition(provider).name} access expired. Reconnect it.`);
  const definition = providerDefinition(provider);
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refreshToken });
  if (provider !== "quickbooks") {
    body.set("client_id", definition.clientId);
    body.set("client_secret", definition.clientSecret);
  }
  const token = await requestTokens(provider, body);
  await saveIntegrationConnection(ownerId, {
    ...connection,
    accessToken: token.access_token!,
    refreshToken: token.refresh_token || connection.refreshToken,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
  });
  return token.access_token!;
}

