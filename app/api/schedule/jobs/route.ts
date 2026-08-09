import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { getScheduleOwnerId } from "@/lib/schedule/auth";
import { syncJobToGoogle } from "@/lib/schedule/google-calendar";
import { createScheduledJob, listScheduledJobs } from "@/lib/schedule/store";

export const scheduledJobSchema = z.object({
  title: z.string().trim().min(2).max(160),
  address: z.string().trim().min(5).max(300),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  startDate: z.string().date(),
  endDate: z.string().date(),
  crew: z.string().trim().max(120).default(""),
  status: z.enum(["scheduled", "in_progress", "completed"]).default("scheduled"),
  notes: z.string().trim().max(5_000).default(""),
}).refine((value) => value.endDate >= value.startDate, { message: "End date must be on or after the start date.", path: ["endDate"] });

export async function GET(request: Request) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to use the Scale schedule." }, 401);
    const url = new URL(request.url);
    const from = z.string().date().parse(url.searchParams.get("from"));
    const to = z.string().date().parse(url.searchParams.get("to"));
    return json({ jobs: await listScheduledJobs(ownerId, from, to) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = await getScheduleOwnerId(request);
    if (!ownerId) return json({ error: "Sign in to use the Scale schedule." }, 401);
    let job = await createScheduledJob(ownerId, scheduledJobSchema.parse(await request.json()));
    if (!job) throw new Error("Job could not be saved.");
    let calendarWarning: string | undefined;
    try { job = await syncJobToGoogle(ownerId, job); }
    catch (error) { calendarWarning = error instanceof Error ? error.message : "Google Calendar sync failed."; }
    return json({ job, calendarWarning }, 201);
  } catch (error) { return apiError(error); }
}
