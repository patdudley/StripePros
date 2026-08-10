import { json } from "@/lib/api";
import { findExactGoogleAddresses } from "@/lib/google-geocoding";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) return json({ error: "Enter a complete street address." }, 400);
  try {
    const results = await findExactGoogleAddresses(query);
    if (!results.length) return json({ error: "No exact street address was found. Include the street number, city, state, and ZIP code." }, 404);
    return json({ results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Address search is temporarily unavailable." }, 502);
  }
}
