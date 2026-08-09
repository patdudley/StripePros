import { apiError, json } from "@/lib/api";
import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { deleteJobFromGoogle, syncJobToGoogle } from "@/lib/schedule/google-calendar";
import { deleteScheduledJob, getScheduledJob, updateScheduledJob } from "@/lib/schedule/store";
import { scheduledJobSchema } from "../route";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to use the Scale schedule." }, 401);
    const { id } = await params;
    let job = await updateScheduledJob(ownerId, id, scheduledJobSchema.parse(await request.json()));
    if (!job) return json({ error: "Job not found." }, 404);
    let calendarWarning: string | undefined;
    try { job = await syncJobToGoogle(ownerId, job); }
    catch (error) { calendarWarning = error instanceof Error ? error.message : "Google Calendar sync failed."; }
    return json({ job, calendarWarning });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to use the Scale schedule." }, 401);
    const { id } = await params;
    const job = await getScheduledJob(ownerId, id);
    if (!job) return json({ error: "Job not found." }, 404);
    let calendarWarning: string | undefined;
    try { await deleteJobFromGoogle(ownerId, job); }
    catch (error) { calendarWarning = error instanceof Error ? error.message : "Google Calendar sync failed."; }
    return await deleteScheduledJob(ownerId, id) ? json({ deleted: true, calendarWarning }) : json({ error: "Job not found." }, 404);
  } catch (error) { return apiError(error); }
}
