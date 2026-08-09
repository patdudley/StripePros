import { isValidTileCoordinate } from "@/lib/nearmap";

type Context = { params: Promise<{ z: string; x: string; y: string }> };

export async function GET(request: Request, context: Context) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return new Response("Google Map Tiles is not configured.", { status: 503 });

  const session = new URL(request.url).searchParams.get("session")?.trim();
  const hasControlCharacter = session ? [...session].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  }) : false;
  if (!session || session.length > 2048 || hasControlCharacter) {
    return new Response("Invalid Google Map Tiles session.", { status: 400 });
  }

  const { z: rawZ, x: rawX, y: rawY } = await context.params;
  const z = Number(rawZ);
  const x = Number(rawX);
  const y = Number(rawY);
  if (!isValidTileCoordinate(z, x, y)) return new Response("Invalid tile coordinate.", { status: 400 });

  const upstream = new URL(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}`);
  upstream.searchParams.set("session", session);
  upstream.searchParams.set("key", apiKey);
  const tile = await fetch(upstream, { cache: "no-store" });
  if (!tile.ok || !tile.body) return new Response("Google imagery tile unavailable.", { status: tile.status });

  const headers = new Headers({
    "Content-Type": tile.headers.get("content-type") ?? "image/jpeg",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["cache-control", "etag", "last-modified"]) {
    const value = tile.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(tile.body, { headers });
}
