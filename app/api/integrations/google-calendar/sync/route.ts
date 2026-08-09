import { apiError, json } from "@/lib/api";
import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { syncGoogleCalendar } from "@/lib/schedule/google-calendar";

export async function POST(request: Request) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to sync Google Calendar." }, 401);
    return json(await syncGoogleCalendar(ownerId));
  } catch (error) { return apiError(error); }
}
