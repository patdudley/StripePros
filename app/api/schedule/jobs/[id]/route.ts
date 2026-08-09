import { apiError, json } from "@/lib/api";
import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { deleteScheduledJob, updateScheduledJob } from "@/lib/schedule/store";
import { scheduledJobSchema } from "../route";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to use the Scale schedule." }, 401);
    const { id } = await params;
    const job = await updateScheduledJob(ownerId, id, scheduledJobSchema.parse(await request.json()));
    return job ? json({ job }) : json({ error: "Job not found." }, 404);
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to use the Scale schedule." }, 401);
    const { id } = await params;
    return await deleteScheduledJob(ownerId, id) ? json({ deleted: true }) : json({ error: "Job not found." }, 404);
  } catch (error) { return apiError(error); }
}
