import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { integrationAuthorizationUrl } from "@/lib/integrations/oauth";
import { isOAuthIntegrationProvider } from "@/lib/integrations/providers";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!isOAuthIntegrationProvider(provider)) return Response.redirect(new URL("/workspace?view=integrations&integration=unsupported", request.url));
  const ownerId = await getScheduleOwnerId(request);
  if (!ownerId) return Response.redirect(new URL("/login", request.url));
  try {
    const redirectUri = new URL(`/api/integrations/${provider}/callback`, request.url).toString();
    return Response.redirect(await integrationAuthorizationUrl(ownerId, provider, redirectUri));
  } catch (error) {
    const destination = new URL("/workspace", request.url);
    destination.searchParams.set("view", "integrations");
    destination.searchParams.set("integration", "not-configured");
    destination.searchParams.set("reason", error instanceof Error ? error.message : "The integration is unavailable.");
    return Response.redirect(destination);
  }
}

