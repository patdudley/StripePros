import { readSession } from "@/lib/session";

export async function getScheduleOwnerId(request: Request): Promise<string | null> {
  const platformId = request.headers.get("oai-authenticated-user-id")?.trim();
  if (platformId) return platformId;
  return readSession(request);
}
