import { apiError, json } from "@/lib/api";
import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { disconnectGoogleCalendar, getGoogleCalendarStatus } from "@/lib/schedule/google-calendar";

export async function GET(request: Request) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to connect Google Calendar." }, 401);
    return json(await getGoogleCalendarStatus(ownerId));
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to disconnect Google Calendar." }, 401);
    await disconnectGoogleCalendar(ownerId);
    return json({ disconnected: true });
  } catch (error) { return apiError(error); }
}
