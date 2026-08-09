import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { googleAuthorizationUrl } from "@/lib/schedule/google-calendar";

export async function GET(request: Request) {
  const ownerId = await getScheduleOwnerId(request);
  if (!ownerId) return Response.redirect(new URL("/login", request.url));
  try {
    const redirectUri = new URL("/api/integrations/google-calendar/callback", request.url).toString();
    return Response.redirect(await googleAuthorizationUrl(ownerId, redirectUri));
  } catch (error) {
    const url = new URL("/workspace", request.url);
    url.searchParams.set("view", "schedule");
    url.searchParams.set("calendar", "not-configured");
    url.searchParams.set("reason", error instanceof Error ? error.message : "Google Calendar is unavailable.");
    return Response.redirect(url);
  }
}
