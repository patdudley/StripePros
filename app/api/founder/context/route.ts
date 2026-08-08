import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { getFounder } from "@/lib/founder/auth";
import { founderDate } from "@/lib/founder/date";
import { getRecentGitHubActivity } from "@/lib/founder/github";
import { getDailyEntry, listDrafts, listPostedDrafts, saveDailyEntry } from "@/lib/founder/store";

const dailyContextSchema = z.object({
  note: z.string().max(10_000),
  metrics: z.object({
    dials: z.coerce.number().int().min(0).max(100_000),
    ownerConversations: z.coerce.number().int().min(0).max(100_000),
    demosBooked: z.coerce.number().int().min(0).max(100_000),
    demosHeld: z.coerce.number().int().min(0).max(100_000),
    trials: z.coerce.number().int().min(0).max(100_000),
    customers: z.coerce.number().int().min(0).max(100_000),
    mrr: z.coerce.number().min(0).max(100_000_000),
  }),
});

export async function GET(request: Request) {
  try {
    const founder = await getFounder(request);
    if (!founder) return json({ error: "Not found." }, 404);
    const date = founderDate();
    const [entry, drafts, postedContent, commits] = await Promise.all([
      getDailyEntry(founder.id, date),
      listDrafts(founder.id, date, 12),
      listPostedDrafts(founder.id, 10),
      getRecentGitHubActivity(24),
    ]);
    return json({
      founder,
      date,
      commits,
      entry: entry || { note: "", dials: 0, ownerConversations: 0, demosBooked: 0, demosHeld: 0, trials: 0, customers: 0, mrr: 0 },
      drafts,
      postedContent,
    });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const founder = await getFounder(request);
    if (!founder) return json({ error: "Not found." }, 404);
    const input = dailyContextSchema.parse(await request.json());
    const date = founderDate();
    const entry = await saveDailyEntry(founder.id, date, { note: input.note, ...input.metrics });
    return json({ entry });
  } catch (error) { return apiError(error); }
}
