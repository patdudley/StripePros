import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { exchangeGoogleCode, syncGoogleCalendar, verifyGoogleOAuthState } from "@/lib/schedule/google-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/workspace", request.url);
  destination.searchParams.set("view", "schedule");
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const signedInOwner = await getScheduleOwnerId(request);
    if (!code || !state || !signedInOwner) throw new Error("The Google Calendar connection was not completed.");
    const stateOwner = await verifyGoogleOAuthState(state);
    if (stateOwner !== signedInOwner) throw new Error("The Google Calendar connection belongs to a different account.");
    const redirectUri = new URL("/api/integrations/google-calendar/callback", request.url).toString();
    await exchangeGoogleCode(signedInOwner, code, redirectUri);
    await syncGoogleCalendar(signedInOwner);
    destination.searchParams.set("calendar", "connected");
  } catch (error) {
    destination.searchParams.set("calendar", "error");
    destination.searchParams.set("reason", error instanceof Error ? error.message : "Google Calendar could not be connected.");
  }
  return Response.redirect(destination);
}
