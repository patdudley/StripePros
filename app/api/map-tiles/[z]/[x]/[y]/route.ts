import { isValidSurveyId, isValidTileCoordinate } from "@/lib/nearmap";

type Context = { params: Promise<{ z: string; x: string; y: string }> };

export async function GET(request: Request, context: Context) {
  const apiKey = process.env.NEARMAP_API_KEY?.trim();
  if (!apiKey) return new Response("Nearmap is not configured.", { status: 503 });

  const { z: rawZ, x: rawX, y: rawY } = await context.params;
  const z = Number(rawZ);
  const x = Number(rawX);
  const y = Number(rawY);
  if (!isValidTileCoordinate(z, x, y)) return new Response("Invalid tile coordinate.", { status: 400 });

  const surveyId = new URL(request.url).searchParams.get("surveyId")?.trim() ?? "";
  if (surveyId && !isValidSurveyId(surveyId)) return new Response("Invalid survey.", { status: 400 });
  const surveyPath = surveyId ? `surveys/${surveyId}/` : "";
  const upstream = await fetch(`https://api.nearmap.com/tiles/v3/${surveyPath}Vert/${z}/${x}/${y}.jpg`, {
    headers: { Authorization: `Apikey ${apiKey}` },
  });
  if (!upstream.ok || !upstream.body) return new Response("Imagery tile unavailable.", { status: upstream.status });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=900",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

