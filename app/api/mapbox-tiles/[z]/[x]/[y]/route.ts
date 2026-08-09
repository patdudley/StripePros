import { isValidTileCoordinate } from "@/lib/nearmap";

type Context = { params: Promise<{ z: string; x: string; y: string }> };

export async function GET(_request: Request, context: Context) {
  const accessToken = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!accessToken) return new Response("Mapbox is not configured.", { status: 503 });

  const { z: rawZ, x: rawX, y: rawY } = await context.params;
  const z = Number(rawZ);
  const x = Number(rawX);
  const y = Number(rawY);
  if (!isValidTileCoordinate(z, x, y)) return new Response("Invalid tile coordinate.", { status: 400 });

  const upstream = await fetch(`https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg90?access_token=${encodeURIComponent(accessToken)}`);
  if (!upstream.ok || !upstream.body) return new Response("Imagery tile unavailable.", { status: upstream.status });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=900",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

