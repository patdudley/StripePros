import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { exchangeIntegrationCode, verifyIntegrationOAuthState } from "@/lib/integrations/oauth";
import { isOAuthIntegrationProvider, providerDefinition } from "@/lib/integrations/providers";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const destination = new URL("/workspace", request.url);
  destination.searchParams.set("view", "integrations");
  if (!isOAuthIntegrationProvider(provider)) {
    destination.searchParams.set("integration", "unsupported");
    return Response.redirect(destination);
  }
  try {
    const callback = new URL(request.url);
    const code = callback.searchParams.get("code");
    const stateValue = callback.searchParams.get("state");
    const signedInOwner = await getScheduleOwnerId(request);
    if (!code || !stateValue || !signedInOwner) throw new Error(`The ${providerDefinition(provider).name} connection was not completed.`);
    const state = await verifyIntegrationOAuthState(stateValue, provider);
    if (state.ownerId !== signedInOwner) throw new Error("This connection belongs to a different Stripe Pros account.");
    const redirectUri = new URL(`/api/integrations/${provider}/callback`, request.url).toString();
    await exchangeIntegrationCode(signedInOwner, provider, code, redirectUri, state.verifier, callback);
    destination.searchParams.set("integration", "connected");
    destination.searchParams.set("provider", provider);
  } catch (error) {
    destination.searchParams.set("integration", "error");
    destination.searchParams.set("reason", error instanceof Error ? error.message : "The connection failed.");
  }
  return Response.redirect(destination);
}

