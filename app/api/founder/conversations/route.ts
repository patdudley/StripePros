import { apiError, json } from "@/lib/api";
import { getFounder } from "@/lib/founder/auth";
import { searchMarketSignals } from "@/lib/founder/market-signals";
import { listConversations, upsertConversations } from "@/lib/founder/store";

export async function GET(request: Request) {
  try {
    const founder = await getFounder(request);
    if (!founder) return json({ error: "Not found." }, 404);
    const results = await listConversations(founder.id, 5);
    return json({ results });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const founder = await getFounder(request);
    if (!founder) return json({ error: "Not found." }, 404);
    const signals = await searchMarketSignals();
    await upsertConversations(founder.id, signals.map((signal) => ({ ...signal, provider: "reddit-public-rss" })));
    const results = await listConversations(founder.id, 5);
    return json({ results, searched: signals.length });
  } catch (error) { return apiError(error); }
}
