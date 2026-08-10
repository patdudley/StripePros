import { json } from "@/lib/api";
import { findExactGoogleAddresses } from "@/lib/google-geocoding";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) return json({ results: [] });
  try {
    return json({ results: await findExactGoogleAddresses(query) });
  } catch (error) {
    return json({ results: [], error: error instanceof Error ? error.message : "Address suggestions are temporarily unavailable." }, 502);
  }
}
