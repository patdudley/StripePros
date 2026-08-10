import { json } from "@/lib/api";
import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { deleteIntegrationConnection } from "@/lib/integrations/store";
import { isOAuthIntegrationProvider } from "@/lib/integrations/providers";

export async function DELETE(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!isOAuthIntegrationProvider(provider)) return json({ error: "Unknown integration." }, 404);
  const ownerId = await getScheduleOwnerId(request);
  if (!ownerId) return json({ error: "Sign in before changing integrations." }, 401);
  await deleteIntegrationConnection(ownerId, provider);
  return json({ ok: true });
}

