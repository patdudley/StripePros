import { json } from "@/lib/api";

export async function GET() {
  const apiKey = process.env.NEARMAP_API_KEY?.trim();
  if (!apiKey) return json({ provider: "esri" });

  return json({
    provider: "nearmap",
    tileUrl: `https://api.nearmap.com/tiles/v3/Vert/{z}/{x}/{y}.jpg?apikey=${encodeURIComponent(apiKey)}`,
  });
}
