import { json } from "@/lib/api";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) return json({ error: "Enter a complete address." }, 400);

  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format", "jsonv2");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("countrycodes", "us");
  endpoint.searchParams.set("q", query);

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "StripePros/0.1 (parking-lot estimating application)",
    },
  });
  if (!response.ok) return json({ error: "Address search is temporarily unavailable." }, 502);

  const results = await response.json() as Array<{ display_name: string; lat: string; lon: string }>;
  return json({
    results: results.map((result) => ({
      label: result.display_name,
      lat: Number(result.lat),
      lng: Number(result.lon),
    })),
  });
}
