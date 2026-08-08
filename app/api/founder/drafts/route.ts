import { apiError, json } from "@/lib/api";
import { getFounder } from "@/lib/founder/auth";
import { generateFounderDrafts } from "@/lib/founder/content";
import { founderDate } from "@/lib/founder/date";
import { getRecentGitHubActivity } from "@/lib/founder/github";
import { getDailyEntry, insertDrafts, listPostedDrafts } from "@/lib/founder/store";

export async function POST(request: Request) {
  try {
    const founder = await getFounder(request);
    if (!founder) return json({ error: "Not found." }, 404);
    const date = founderDate();
    const [entry, previous, commits] = await Promise.all([
      getDailyEntry(founder.id, date),
      listPostedDrafts(founder.id, 20),
      getRecentGitHubActivity(24),
    ]);
    const generated = generateFounderDrafts({
      commits,
      note: entry?.note || "",
      metrics: { dials: entry?.dials || 0, ownerConversations: entry?.ownerConversations || 0, demosBooked: entry?.demosBooked || 0, demosHeld: entry?.demosHeld || 0, trials: entry?.trials || 0, customers: entry?.customers || 0, mrr: entry?.mrr || 0 },
      previousPosts: previous.map((item) => item.body),
    });
    const drafts = await insertDrafts(founder.id, date, generated);
    return json({ drafts }, 201);
  } catch (error) { return apiError(error); }
}
